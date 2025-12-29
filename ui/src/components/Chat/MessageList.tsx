import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { FolderOpen, Search, Settings } from "lucide-react";
import type { Message } from "../../hooks/useChat";

type MessageListProps = {
  messages: Message[];
  hasIndexedFiles: boolean;
  onOpenSettings: () => void;
};

export function MessageList({
  messages,
  hasIndexedFiles,
  onOpenSettings,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    if (!hasIndexedFiles) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <FolderOpen className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Index Your Files
            </h2>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Select a folder to index and start searching your documents with
              natural language.
            </p>
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Open Settings to Index
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-lg font-medium text-gray-700">
            Welcome to FinderAI
          </p>
          <p className="text-sm mt-1">Ask questions about your indexed files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
