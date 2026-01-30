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
    const userEmail = req.headers.get("x-user-email");
    const authHeader = req.headers.get("authorization");

    let email = userEmail;

    if (!email && authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const payload = JSON.parse(atob(token.split(".")[1]));
        email = payload.email || payload.primary_email_address;
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

    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const customer = customers.data[0];

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: "docora://settings",
    });

    return new Response(JSON.stringify({ portal_url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
