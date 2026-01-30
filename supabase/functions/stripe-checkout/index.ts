import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2024-11-20",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { billing_period, success_url, cancel_url } = await req.json();

    const userEmail = req.headers.get("x-user-email");
    const authHeader = req.headers.get("authorization");

    let email = userEmail;
    let userId = "anonymous";

    if (!email && authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const payload = JSON.parse(atob(token.split(".")[1]));
        email = payload.email || payload.primary_email_address;
        userId = payload.sub || "anonymous";
      } catch {
        // ignore JWT parse errors
      }
    }

    if (!email) {
      return new Response(JSON.stringify({ error: "User email required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId =
      billing_period === "monthly"
        ? Deno.env.get("STRIPE_PRICE_ID_MONTHLY")
        : Deno.env.get("STRIPE_PRICE_ID_ANNUAL");

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "Stripe prices not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer: Stripe.Customer;

    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        metadata: { clerk_user_id: userId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: { clerk_user_id: userId },
    });

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
