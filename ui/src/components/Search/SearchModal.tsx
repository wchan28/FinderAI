import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, X, SquarePen } from "lucide-react";
import type { Conversation, ConversationId } from "../../types/chat";
import { filterConversations } from "../Sidebar/ChatSidebar";
import { SearchResultItem } from "./SearchResultItem";

type SearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: ConversationId) => void;
  onNewChat?: () => void;
};

type GroupedConversations = {
  today: Conversation[];
  previous30Days: Conversation[];
};

function groupConversationsByTime(
  conversations: Conversation[],
): GroupedConversations {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOf30DaysAgo = new Date(startOfToday);
  startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);

  const groups: GroupedConversations = {
    today: [],
    previous30Days: [],
  };

  for (const conv of conversations) {
    const updatedAt = conv.updatedAt;
    if (updatedAt >= startOfToday.getTime()) {
      groups.today.push(conv);
    } else if (updatedAt >= startOf30DaysAgo.getTime()) {
      groups.previous30Days.push(conv);
    }
  }

  return groups;
}

export function SearchModal({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
  onNewChat,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const filteredResults = useMemo(
    () => filterConversations(conversations, searchQuery),
    [conversations, searchQuery],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByTime(conversations),
    [conversations],
  );

  const displayResults = searchQuery.trim() ? filteredResults : conversations;

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
      <div className="relative bg-white rounded-xl shadow-2xl max-w-xl w-full mx-4 h-[70vh] max-h-[600px] flex flex-col">
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
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-2">
          {onNewChat && (
            <button
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="w-full text-left px-4 py-3 rounded-lg transition-colors hover:bg-gray-50 flex items-center gap-3"
            >
              <SquarePen className="w-4 h-4 text-gray-500" />
              <span className="text-gray-900">New chat</span>
            </button>
          )}

          {searchQuery.trim() ? (
            filteredResults.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No conversations match your search
              </div>
            ) : (
              filteredResults.map((conversation, index) => (
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
              ))
            )
          ) : conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No conversations yet
            </div>
          ) : (
            <>
              {groupedConversations.today.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-medium text-gray-400">
                    Today
                  </div>
                  {groupedConversations.today.map((conversation) => {
                    const index = conversations.indexOf(conversation);
                    return (
                      <SearchResultItem
                        key={conversation.id}
                        conversation={conversation}
                        searchQuery=""
                        isSelected={index === selectedIndex}
                        onClick={() => {
                          onSelectConversation(conversation.id);
                          onClose();
                        }}
                      />
                    );
                  })}
                </>
              )}

              {groupedConversations.previous30Days.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-medium text-gray-400">
                    Previous 30 Days
                  </div>
                  {groupedConversations.previous30Days.map((conversation) => {
                    const index = conversations.indexOf(conversation);
                    return (
                      <SearchResultItem
                        key={conversation.id}
                        conversation={conversation}
                        searchQuery=""
                        isSelected={index === selectedIndex}
                        onClick={() => {
                          onSelectConversation(conversation.id);
                          onClose();
                        }}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
