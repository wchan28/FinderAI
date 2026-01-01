import type { Message } from "../../hooks/useChat";

type MatchingSnippet = {
  text: string;
  matchStart: number;
  matchEnd: number;
};

export function getMatchingSnippet(
  messages: Message[],
  query: string,
  maxLength: number = 100,
): MatchingSnippet | null {
  const lowerQuery = query.toLowerCase();

  for (const msg of messages) {
    const lowerContent = msg.content.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);

    if (matchIndex !== -1) {
      const contextPadding = Math.floor((maxLength - query.length) / 2);
      let start = Math.max(0, matchIndex - contextPadding);
      let end = Math.min(
        msg.content.length,
        matchIndex + query.length + contextPadding,
      );

      if (start > 0) {
        const spaceIndex = msg.content.indexOf(" ", start);
        if (spaceIndex !== -1 && spaceIndex < matchIndex) {
          start = spaceIndex + 1;
        }
      }

      if (end < msg.content.length) {
        const spaceIndex = msg.content.lastIndexOf(" ", end);
        if (spaceIndex > matchIndex + query.length) {
          end = spaceIndex;
        }
      }

      const text =
        (start > 0 ? "..." : "") +
        msg.content.slice(start, end) +
        (end < msg.content.length ? "..." : "");
      const adjustedMatchStart = matchIndex - start + (start > 0 ? 3 : 0);
      const adjustedMatchEnd = adjustedMatchStart + query.length;

      return {
        text,
        matchStart: adjustedMatchStart,
        matchEnd: adjustedMatchEnd,
      };
    }
  }

  return null;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 4)
    return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

export type HighlightSegment = {
  text: string;
  isMatch: boolean;
};

export function highlightMatch(
  text: string,
  query: string,
): HighlightSegment[] {
  if (!query.trim()) {
    return [{ text, isMatch: false }];
  }

  const segments: HighlightSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;

  let matchIndex = lowerText.indexOf(lowerQuery);
  while (matchIndex !== -1) {
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        isMatch: false,
      });
    }

    segments.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true,
    });

    lastIndex = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isMatch: false,
    });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}
