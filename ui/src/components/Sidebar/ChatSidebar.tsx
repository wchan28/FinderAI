import { useState } from "react";
import { SquarePen, Search } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { UserProfileMenu } from "./UserProfileMenu";
import { SearchModal } from "../Search/SearchModal";
import { UpdateIndicator } from "../UpdateIndicator";
import type { Conversation, ConversationId } from "../../types/chat";

export function filterConversations(
  conversations: Conversation[],
  searchQuery: string,
): Conversation[] {
  const trimmed = searchQuery.trim();
  if (!trimmed) return conversations;

  const query = trimmed.toLowerCase();
  return conversations.filter(
    (conv) =>
      conv.title.toLowerCase().includes(query) ||
      conv.messages.some((msg) => msg.content.toLowerCase().includes(query)),
  );
}

type ChatSidebarProps = {
  isOpen: boolean;
  conversations: Conversation[];
  activeConversationId: ConversationId | null;
  onSelectConversation: (id: ConversationId) => void;
  onNewChat: () => void;
  onRenameConversation: (id: ConversationId, newTitle: string) => void;
  onDeleteConversation: (id: ConversationId) => void;
  onOpenSettings: () => void;
};

export function ChatSidebar({
  isOpen,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onOpenSettings,
}: ChatSidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div
      className={`flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out ${
        isOpen ? "w-64" : "w-0"
      } overflow-hidden`}
    >
      <div className="drag-region px-3 pt-3 pb-1 flex flex-col gap-0.5">
        <button
          onClick={onNewChat}
          className="no-drag flex items-center gap-3 px-2 py-2 text-sm text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors w-full"
        >
          <SquarePen className="w-4 h-4" strokeWidth={2} />
          <span>New chat</span>
        </button>
        <button
          onClick={() => setIsSearchOpen(true)}
          className="no-drag flex items-center gap-3 px-2 py-2 text-sm text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors w-full"
        >
          <Search className="w-4 h-4" strokeWidth={2} />
          <span>Search chats</span>
        </button>
      </div>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        conversations={conversations}
        onSelectConversation={(id) => {
          onSelectConversation(id);
          setIsSearchOpen(false);
        }}
        onNewChat={onNewChat}
      />

      <div className="flex-1 overflow-y-auto pt-4 pb-2 sidebar-scrollbar-light">
        <h3 className="px-4 pb-2 text-xs font-medium text-gray-500">
          Your chats
        </h3>
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
        />
      </div>

      <div className="border-t border-gray-200 px-2 py-2">
        <UpdateIndicator />
        <UserProfileMenu onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
