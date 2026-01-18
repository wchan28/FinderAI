import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import { AnalyticsProvider } from "./providers/AnalyticsProvider";
import { SubscriptionProvider } from "./providers/SubscriptionProvider";
import "./index.css";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const root = document.getElementById("root")!;

if (CLERK_PUBLISHABLE_KEY) {
  ReactDOM.createRoot(root).render(
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AnalyticsProvider>
        <SubscriptionProvider>
          <App />
        </SubscriptionProvider>
      </AnalyticsProvider>
    </ClerkProvider>,
  );
} else {
  console.warn(
    "VITE_CLERK_PUBLISHABLE_KEY not set - running without auth/analytics",
  );
  ReactDOM.createRoot(root).render(
    <SubscriptionProvider>
      <App />
    </SubscriptionProvider>,
  );
}
