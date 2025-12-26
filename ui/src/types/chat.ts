import type { Message } from "../hooks/useChat";

export type ConversationId = string & { __brand: "ConversationId" };

export type Conversation = {
  id: ConversationId;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type ChatHistoryState = {
  conversations: Conversation[];
  activeConversationId: ConversationId | null;
};

export function createConversationId(): ConversationId {
  return crypto.randomUUID() as ConversationId;
}

export function generateTitle(content: string): string {
  const maxLength = 40;
  const trimmed = content.trim().replace(/\n/g, " ");
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength) + "...";
}
