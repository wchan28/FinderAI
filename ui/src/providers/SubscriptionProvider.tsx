import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { getSubscription } from "../api/client";
import type { SubscriptionResponse } from "../api/client";
import { CLERK_ENABLED } from "../lib/clerk";

type SubscriptionContextType = SubscriptionResponse & {
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const defaultState: SubscriptionResponse = {
  tier: "pro",
  is_trial: true,
  trial_days_remaining: 14,
  is_beta_user: false,
  limits: {
    max_indexed_files: -1,
    max_searches_per_month: -1,
    conversation_history_days: -1,
  },
  usage: {
    indexed_files: 0,
    searches_this_month: 0,
    archived_files: 0,
  },
  allowed_file_types: [".pdf", ".docx", ".pptx", ".xlsx"],
  grace_period: {
    in_grace_period: false,
    days_remaining: 0,
    archive_deadline: null,
    files_to_archive_count: 0,
    files_to_archive: [],
  },
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  ...defaultState,
  isLoading: true,
  refresh: async () => {},
});

function SubscriptionProviderWithClerk({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionResponse>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const { getToken } = useAuth();
  const { user } = useUser();

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      const email = user?.primaryEmailAddress?.emailAddress;
      const data = await getSubscription(token ?? undefined, email);
      setState(data);
    } catch (error) {
      console.debug("Failed to fetch subscription:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getToken, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  return (
    <SubscriptionContext.Provider value={{ ...state, isLoading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

function SubscriptionProviderWithoutClerk({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<SubscriptionResponse>(defaultState);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getSubscription();
      setState(data);
    } catch (error) {
      console.debug("Failed to fetch subscription:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  return (
    <SubscriptionContext.Provider value={{ ...state, isLoading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const SubscriptionProvider = CLERK_ENABLED
  ? SubscriptionProviderWithClerk
  : SubscriptionProviderWithoutClerk;

export function useSubscription() {
  return useContext(SubscriptionContext);
}
