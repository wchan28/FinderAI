import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";
import type { Conversation, ConversationId } from "../../types/chat";
import { filterConversations } from "../Sidebar/ChatSidebar";
import { SearchResultItem } from "./SearchResultItem";

type SearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: ConversationId) => void;
};

export function SearchModal({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const filteredResults = useMemo(
    () => filterConversations(conversations, searchQuery),
    [conversations, searchQuery],
  );

  const displayResults = searchQuery.trim()
    ? filteredResults
    : conversations.slice(0, 5);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (resultsContainerRef.current && displayResults.length > 0) {
      const selectedElement = resultsContainerRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, displayResults.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < displayResults.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && displayResults.length > 0) {
        e.preventDefault();
        const selected = displayResults[selectedIndex];
        if (selected) {
          onSelectConversation(selected.id);
          onClose();
        }
      }
    },
    [displayResults, selectedIndex, onSelectConversation, onClose],
  );

  const handleBackdropKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleBackdropKeyDown);
      return () =>
        document.removeEventListener("keydown", handleBackdropKeyDown);
    }
  }, [isOpen, handleBackdropKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-xl w-full mx-4 max-h-[70vh] flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations..."
            className="flex-1 text-gray-900 placeholder-gray-400 outline-none text-base"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-2">
          {displayResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              {searchQuery.trim()
                ? "No conversations match your search"
                : "No conversations yet"}
            </div>
          ) : (
            <>
              {!searchQuery.trim() && (
                <div className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Recent Conversations
                </div>
              )}
              {displayResults.map((conversation, index) => (
                <SearchResultItem
                  key={conversation.id}
                  conversation={conversation}
                  searchQuery={searchQuery}
                  isSelected={index === selectedIndex}
                  onClick={() => {
                    onSelectConversation(conversation.id);
                    onClose();
                  }}
                />
              ))}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              ↓
            </kbd>
            to navigate
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              Enter
            </kbd>
            to select
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              Esc
            </kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
