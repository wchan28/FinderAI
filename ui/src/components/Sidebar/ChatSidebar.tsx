import { Plus, PanelLeftClose } from "lucide-react";
import { ConversationList } from "./ConversationList";
import type { Conversation, ConversationId } from "../../types/chat";

type ChatSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  activeConversationId: ConversationId | null;
  onSelectConversation: (id: ConversationId) => void;
  onNewChat: () => void;
  onRenameConversation: (id: ConversationId, newTitle: string) => void;
  onDeleteConversation: (id: ConversationId) => void;
};

export function ChatSidebar({
  isOpen,
  onToggle,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  return (
    <div
      className={`flex flex-col bg-gray-900 transition-all duration-300 ease-in-out ${
        isOpen ? "w-64" : "w-0"
      } overflow-hidden`}
    >
      <div className="drag-region flex items-center justify-between pt-12 px-3 pb-3">
        <button
          onClick={onNewChat}
          className="no-drag flex items-center gap-2 px-3 py-2 text-sm text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
        <button
          onClick={onToggle}
          className="no-drag p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          title="Close sidebar"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 sidebar-scrollbar">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
        />
      </div>
    </div>
  );
}
