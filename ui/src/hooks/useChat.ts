import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { streamChat, Source } from "../api/client";
import type { ThinkingStatus } from "../components/Chat/ThinkingIndicator";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  status?: ThinkingStatus;
}

type UseChatOptions = {
  conversationId?: string | null;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
};

export function useChat(options: UseChatOptions = {}) {
  const { conversationId, initialMessages, onMessagesChange } = options;
  const { getToken } = useAuth();
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
    async (content: string) => {
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
            onDone: () => {
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.isStreaming = false;
                  lastMsg.sources = sources;
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
