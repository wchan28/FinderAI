import { ConversationItem } from "./ConversationItem";
import type { Conversation, ConversationId } from "../../types/chat";

type ConversationListProps = {
  conversations: Conversation[];
  activeConversationId: ConversationId | null;
  onSelect: (id: ConversationId) => void;
  onRename: (id: ConversationId, newTitle: string) => void;
  onDelete: (id: ConversationId) => void;
  hasSearchQuery?: boolean;
};

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onRename,
  onDelete,
  hasSearchQuery = false,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-gray-500 text-sm">
        {hasSearchQuery ? "No results found" : "No conversations yet"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isActive={conversation.id === activeConversationId}
          onSelect={() => onSelect(conversation.id)}
          onRename={(newTitle) => onRename(conversation.id, newTitle)}
          onDelete={() => onDelete(conversation.id)}
        />
      ))}
    </div>
  );
}
