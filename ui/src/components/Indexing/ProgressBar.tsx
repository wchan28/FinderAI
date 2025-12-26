import { useRef, useEffect } from "react";

interface ProgressBarProps {
  messages: string[];
  isActive: boolean;
}

export function ProgressBar({ messages, isActive }: ProgressBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !isActive) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        {isActive && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span className="text-sm font-medium text-gray-700">
          {isActive ? "Indexing in progress..." : "Indexing complete"}
        </span>
      </div>

      <div
        ref={containerRef}
        className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg max-h-48 overflow-y-auto"
      >
        {messages.map((msg, i) => (
          <div key={i} className="py-0.5">
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}
