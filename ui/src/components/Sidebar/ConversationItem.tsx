import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(conversation.title);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(conversation.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  if (isEditing) {
    return (
      <div className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleConfirmEdit}
          className="flex-1 bg-gray-600 text-gray-100 text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleConfirmEdit}
          className="p-1 text-green-400 hover:text-green-300 transition-colors"
          title="Save"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={handleCancelEdit}
          className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={`group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
        isActive
          ? "bg-gray-700 text-gray-100"
          : "text-gray-300 hover:bg-gray-800 hover:text-gray-100"
      }`}
    >
      <span className="flex-1 text-sm truncate">{conversation.title}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleStartEdit}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="Rename"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </button>
  );
}
