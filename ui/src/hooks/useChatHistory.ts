import { useState, useCallback, useEffect, useRef } from "react";
import type { Message } from "./useChat";
import type {
  Conversation,
  ConversationId,
  ChatHistoryState,
} from "../types/chat";
import { createConversationId, generateTitle } from "../types/chat";
import { useSubscription } from "../providers/SubscriptionProvider";

const CHAT_HISTORY_KEY = "chatHistory";

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

async function loadFromStore(): Promise<ChatHistoryState> {
  try {
    const stored = await window.electronAPI?.storeGet(CHAT_HISTORY_KEY);
    if (stored && typeof stored === "object") {
      const data = stored as ChatHistoryState;
      const conversations = cleanupStaleStreamingState(data.conversations ?? []);
      return {
        conversations,
        activeConversationId: data.activeConversationId ?? null,
      };
    }
  } catch {
    // Invalid data, start fresh
  }
  return { conversations: [], activeConversationId: null };
}

function saveToStore(state: ChatHistoryState): void {
  window.electronAPI?.storeSet(CHAT_HISTORY_KEY, state);
}

export function useChatHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<ConversationId | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialLoad = useRef(true);

  const { limits, isLoading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    loadFromStore().then((state) => {
      setConversations(state.conversations);
      setActiveConversationId(state.activeConversationId);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || subscriptionLoading) return;

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
  }, [limits.conversation_history_days, subscriptionLoading, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    saveToStore({ conversations, activeConversationId });
  }, [conversations, activeConversationId, isLoaded]);

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
    isLoaded,
  };
}
