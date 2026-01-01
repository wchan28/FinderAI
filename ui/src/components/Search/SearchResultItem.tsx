import { MessageSquare } from "lucide-react";
import type { Conversation } from "../../types/chat";
import {
  getMatchingSnippet,
  formatRelativeTime,
  highlightMatch,
} from "./searchUtils";

type SearchResultItemProps = {
  conversation: Conversation;
  searchQuery: string;
  isSelected: boolean;
  onClick: () => void;
};

export function SearchResultItem({
  conversation,
  searchQuery,
  isSelected,
  onClick,
}: SearchResultItemProps) {
  const snippet = searchQuery.trim()
    ? getMatchingSnippet(conversation.messages, searchQuery)
    : null;

  const titleSegments = searchQuery.trim()
    ? highlightMatch(conversation.title, searchQuery)
    : [{ text: conversation.title, isMatch: false }];

  const messageCount = conversation.messages.length;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
        isSelected ? "bg-gray-100" : "hover:bg-gray-50"
      }`}
    >
      <div className="font-medium text-gray-900 truncate">
        {titleSegments.map((segment, i) =>
          segment.isMatch ? (
            <mark
              key={i}
              className="bg-yellow-200 text-gray-900 rounded px-0.5"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </div>

      {snippet && (
        <div className="mt-1 text-sm text-gray-600 line-clamp-2">
          {snippet.text.slice(0, snippet.matchStart)}
          <mark className="bg-yellow-200 text-gray-900 rounded px-0.5">
            {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
          </mark>
          {snippet.text.slice(snippet.matchEnd)}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        <span>{formatRelativeTime(conversation.updatedAt)}</span>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {messageCount} message{messageCount === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}
