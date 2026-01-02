import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { UserProfileMenu } from "./UserProfileMenu";
import { SearchModal } from "../Search/SearchModal";
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
      <div className="drag-region px-3 py-3">
        <button
          onClick={onNewChat}
          className="no-drag flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors w-full"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-400 text-sm rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>Search chats...</span>
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
      />

      <div className="flex-1 overflow-y-auto py-2 sidebar-scrollbar-light">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
        />
      </div>

      <div className="border-t border-gray-200 px-2 py-2">
        <UserProfileMenu onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
