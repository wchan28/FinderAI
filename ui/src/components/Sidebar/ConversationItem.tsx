import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ChatDialog } from "../common/ChatDialog";
import type { Conversation } from "../../types/chat";

type ConversationItemProps = {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
};

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRenameDialog(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`group relative w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
          isActive
            ? "bg-gray-200 text-gray-900"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <span className="flex-1 text-sm truncate">{conversation.title}</span>
        <div className="absolute right-2 flex items-center gap-1 bg-inherit opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleStartEdit}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-gray-500 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ChatDialog
        mode="delete"
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={onDelete}
      />

      <ChatDialog
        mode="rename"
        isOpen={showRenameDialog}
        initialValue={conversation.title}
        onClose={() => setShowRenameDialog(false)}
        onConfirm={onRename}
      />
    </>
  );
}
