import { useState, useCallback, useEffect } from "react";
import type { Message } from "./useChat";
import type {
  Conversation,
  ConversationId,
  ChatHistoryState,
} from "../types/chat";
import { createConversationId, generateTitle } from "../types/chat";
import { useSubscription } from "../providers/SubscriptionProvider";

const CHAT_HISTORY_KEY = "finderai_chat_history";

function cleanupStaleStreamingState(
  conversations: Conversation[],
): Conversation[] {
  return conversations.map((conv) => ({
    ...conv,
    messages: conv.messages.map((msg) => {
      if (msg.isStreaming) {
        return {
          ...msg,
          isStreaming: false,
          status: undefined,
          content: msg.content || "(Interrupted)",
        };
      }
      return msg;
    }),
  }));
}

function pruneConversationsByAge(
  conversations: Conversation[],
  maxAgeDays: number,
): Conversation[] {
  if (maxAgeDays < 0) return conversations;

  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return conversations.filter((c) => c.updatedAt >= cutoffTime);
}

function loadFromStorage(): ChatHistoryState {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ChatHistoryState;
      const conversations = cleanupStaleStreamingState(
        parsed.conversations ?? [],
      );
      return {
        conversations,
        activeConversationId: parsed.activeConversationId ?? null,
      };
    }
  } catch {
    // Invalid data, start fresh
  }
  return { conversations: [], activeConversationId: null };
}

function saveToStorage(state: ChatHistoryState): void {
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(state));
}

export function useChatHistory() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return loadFromStorage().conversations;
  });
  const [activeConversationId, setActiveConversationId] =
    useState<ConversationId | null>(null);

  const { limits, isLoading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    if (subscriptionLoading) return;

    const maxAgeDays = limits.conversation_history_days;
    if (maxAgeDays >= 0) {
      setConversations((prev) => {
        const pruned = pruneConversationsByAge(prev, maxAgeDays);
        if (pruned.length !== prev.length) {
          return pruned;
        }
        return prev;
      });
    }
  }, [limits.conversation_history_days, subscriptionLoading]);

  useEffect(() => {
    saveToStorage({ conversations, activeConversationId });
  }, [conversations, activeConversationId]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  const createConversation = useCallback((): ConversationId => {
    const id = createConversationId();
    const now = Date.now();
    const newConversation: Conversation = {
      id,
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(id);
    return id;
  }, []);

  const selectConversation = useCallback((id: ConversationId) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback(
    (id: ConversationId) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId],
  );

  const clearActiveConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const renameConversation = useCallback(
    (id: ConversationId, newTitle: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c,
        ),
      );
    },
    [],
  );

  const updateMessages = useCallback(
    (id: ConversationId, messages: Message[]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;

          let title = c.title;
          if (title === "New Chat" && messages.length > 0) {
            const firstUserMessage = messages.find((m) => m.role === "user");
            if (firstUserMessage) {
              title = generateTitle(firstUserMessage.content);
            }
          }

          return {
            ...c,
            messages,
            title,
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  const sortedConversations = [...conversations].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return {
    conversations: sortedConversations,
    activeConversation,
    activeConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    clearActiveConversation,
    renameConversation,
    updateMessages,
  };
}
