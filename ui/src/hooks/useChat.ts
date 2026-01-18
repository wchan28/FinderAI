import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { streamChat } from "../api/client";
import type { Source, ConversationMessage, HiddenResults } from "../api/client";
import type { ThinkingStatus } from "../components/Chat/ThinkingIndicator";
import { CLERK_ENABLED } from "../lib/clerk";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  hiddenResults?: HiddenResults;
  isStreaming?: boolean;
  status?: ThinkingStatus;
}

type UseChatOptions = {
  conversationId?: string | null;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
};

function useChatInternal(
  options: UseChatOptions,
  getToken: () => Promise<string | null>,
) {
  const { conversationId, initialMessages, onMessagesChange } = options;
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const onMessagesChangeRef = useRef(onMessagesChange);
  const prevConversationIdRef = useRef(conversationId);
  const isInternalUpdateRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  onMessagesChangeRef.current = onMessagesChange;

  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
      if (!isLoading) {
        setMessages(initialMessages ?? []);
      }
    }
  }, [conversationId, initialMessages, isLoading]);

  useEffect(() => {
    if (isInternalUpdateRef.current) {
      onMessagesChangeRef.current?.(messages);
      isInternalUpdateRef.current = false;
    }
  }, [messages]);

  const setMessagesWithCallback = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      isInternalUpdateRef.current = true;
      setMessages(updater);
    },
    [],
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setMessagesWithCallback((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
          lastMsg.isStreaming = false;
          lastMsg.status = undefined;
          if (!lastMsg.content) {
            lastMsg.content = "(Stopped)";
          }
        }
        return updated;
      });
    }
  }, [setMessagesWithCallback]);

  const sendMessage = useCallback(
    async (content: string, conversationHistory?: ConversationMessage[]) => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        isStreaming: true,
        status: "searching",
      };

      setMessagesWithCallback((prev) => [
        ...prev,
        userMessage,
        assistantMessage,
      ]);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let sources: Source[] = [];
      let hiddenResults: HiddenResults | undefined;
      let hasReceivedChunk = false;

      const clerkToken = await getToken();

      try {
        await streamChat(
          content,
          {
            onChunk: (chunk) => {
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.content += chunk;
                  if (!hasReceivedChunk) {
                    hasReceivedChunk = true;
                    lastMsg.status = "generating";
                  }
                }
                return updated;
              });
            },
            onSources: (newSources) => {
              sources = newSources;
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant" && !hasReceivedChunk) {
                  lastMsg.status = "thinking";
                }
                return updated;
              });
            },
            onHiddenResults: (results) => {
              hiddenResults = results;
            },
            onDone: () => {
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.isStreaming = false;
                  lastMsg.sources = sources;
                  lastMsg.hiddenResults = hiddenResults;
                  lastMsg.status = undefined;
                }
                return updated;
              });
              setIsLoading(false);
              abortControllerRef.current = null;
            },
            onError: (error) => {
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.content = `Error: ${error}`;
                  lastMsg.isStreaming = false;
                  lastMsg.status = undefined;
                }
                return updated;
              });
              setIsLoading(false);
              abortControllerRef.current = null;
            },
          },
          controller.signal,
          clerkToken ?? undefined,
          conversationHistory,
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setMessagesWithCallback((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.role === "assistant") {
            lastMsg.content = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
            lastMsg.isStreaming = false;
            lastMsg.status = undefined;
          }
          return updated;
        });
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [setMessagesWithCallback, getToken],
  );

  const clearMessages = useCallback(() => {
    setMessagesWithCallback([]);
  }, [setMessagesWithCallback]);

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}

function useChatWithClerk(options: UseChatOptions = {}) {
  const { getToken } = useAuth();
  return useChatInternal(options, getToken);
}

function useChatWithoutClerk(options: UseChatOptions = {}) {
  const getToken = useCallback(async () => null, []);
  return useChatInternal(options, getToken);
}

export const useChat = CLERK_ENABLED ? useChatWithClerk : useChatWithoutClerk;
