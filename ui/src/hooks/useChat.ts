import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { streamChat } from "../api/client";
import type { Source, ConversationMessage, HiddenResults } from "../api/client";
import type { ThinkingStatus } from "../components/Chat/ThinkingIndicator";
import type { ConversationId } from "../types/chat";
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
  onMessagesChange?: (
    messages: Message[],
    forConversationId: ConversationId | null,
  ) => void;
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
  const streamingStateRef = useRef<{
    conversationId: ConversationId;
    messages: Message[];
  } | null>(null);
  onMessagesChangeRef.current = onMessagesChange;

  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
      if (
        streamingStateRef.current &&
        streamingStateRef.current.conversationId === conversationId
      ) {
        setMessages(streamingStateRef.current.messages);
      } else {
        setMessages(initialMessages ?? []);
      }
    }
  }, [conversationId, initialMessages]);

  useEffect(() => {
    if (isInternalUpdateRef.current) {
      onMessagesChangeRef.current?.(
        messages,
        streamingStateRef.current?.conversationId ?? null,
      );
      isInternalUpdateRef.current = false;
    }
  }, [messages]);

  const setMessagesWithCallback = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      if (streamingStateRef.current) {
        const streamingMessages = streamingStateRef.current.messages;
        const updated =
          typeof updater === "function" ? updater(streamingMessages) : updater;
        streamingStateRef.current.messages = updated;

        const isViewingStreamingConv =
          streamingStateRef.current.conversationId ===
          prevConversationIdRef.current;

        if (isViewingStreamingConv) {
          isInternalUpdateRef.current = true;
          setMessages(updated);
        } else {
          onMessagesChangeRef.current?.(
            updated,
            streamingStateRef.current.conversationId,
          );
        }
      } else {
        isInternalUpdateRef.current = true;
        setMessages((prev) => {
          return typeof updater === "function" ? updater(prev) : updater;
        });
      }
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
      streamingStateRef.current = null;
    }
  }, [setMessagesWithCallback]);

  const sendMessage = useCallback(
    async (
      content: string,
      forConversationId: ConversationId,
      conversationHistory?: ConversationMessage[],
      previousSources?: string[],
    ) => {
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

      streamingStateRef.current = {
        conversationId: forConversationId,
        messages: [...messages],
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
      let hasReceivedAnyEvent = false;

      const clerkToken = await getToken();

      const timeoutId = setTimeout(() => {
        if (!hasReceivedAnyEvent && abortControllerRef.current) {
          abortControllerRef.current.abort();
          setMessagesWithCallback((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
              lastMsg.content = "Request timed out. Please try again.";
              lastMsg.isStreaming = false;
              lastMsg.status = undefined;
            }
            return updated;
          });
          setIsLoading(false);
          abortControllerRef.current = null;
          streamingStateRef.current = null;
        }
      }, 45000);

      try {
        await streamChat(
          content,
          {
            onChunk: (chunk) => {
              hasReceivedAnyEvent = true;
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
              hasReceivedAnyEvent = true;
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
              hasReceivedAnyEvent = true;
              hiddenResults = results;
            },
            onDone: () => {
              clearTimeout(timeoutId);
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
              streamingStateRef.current = null;
            },
            onError: () => {
              clearTimeout(timeoutId);
              setMessagesWithCallback((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.content = "Something went wrong. Please try again.";
                  lastMsg.isStreaming = false;
                  lastMsg.status = undefined;
                }
                return updated;
              });
              setIsLoading(false);
              abortControllerRef.current = null;
              streamingStateRef.current = null;
            },
          },
          controller.signal,
          clerkToken ?? undefined,
          conversationHistory,
          previousSources,
        );
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setMessagesWithCallback((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.role === "assistant") {
            lastMsg.content = "Something went wrong. Please try again.";
            lastMsg.isStreaming = false;
            lastMsg.status = undefined;
          }
          return updated;
        });
        setIsLoading(false);
        abortControllerRef.current = null;
        streamingStateRef.current = null;
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
