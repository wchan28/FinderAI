import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { supabase, isAnalyticsEnabled } from "../lib/supabase";

type EventType = "auth" | "voyage" | "embedding";

type TrackEventParams = {
  eventType: EventType;
  eventName: string;
  metadata?: Record<string, unknown>;
};

type AnalyticsContextType = {
  trackEvent: (params: TrackEventParams) => void;
  userId: string | null;
};

const AnalyticsContext = createContext<AnalyticsContextType>({
  trackEvent: () => {},
  userId: null,
});

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const hasTrackedSignup = useRef(false);

  const userId = user?.id ?? null;
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const trackEvent = useCallback(
    ({ eventType, eventName, metadata = {} }: TrackEventParams) => {
      if (!isAnalyticsEnabled() || !userId) {
        return;
      }

      supabase!
        .from("analytics_events")
        .insert({
          user_id: userId,
          user_email: userEmail,
          event_type: eventType,
          event_name: eventName,
          metadata,
        })
        .then(({ error }) => {
          if (error) {
            console.debug("Analytics event failed:", error);
          }
        });
    },
    [userId, userEmail],
  );

  useEffect(() => {
    if (!isLoaded || !userId || hasTrackedSignup.current) {
      return;
    }

    hasTrackedSignup.current = true;

    const createdAt = user?.createdAt;
    const isNewUser =
      createdAt && Date.now() - createdAt.getTime() < 5 * 60 * 1000;

    trackEvent({
      eventType: "auth",
      eventName: isNewUser ? "user_signup" : "user_login",
      metadata: { platform: window.navigator.platform },
    });
  }, [isLoaded, userId, user?.createdAt, trackEvent]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, userId }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}
