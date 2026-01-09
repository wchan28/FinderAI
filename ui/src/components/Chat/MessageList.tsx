import { useEffect, useRef, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { MessageBubble } from "./MessageBubble";
import { FolderOpen, Settings } from "lucide-react";
import type { Message } from "../../hooks/useChat";

type MessageListProps = {
  messages: Message[];
  hasIndexedFiles: boolean;
  onOpenSettings: () => void;
  renderInput?: ReactNode;
};

const getGreeting = (firstName: string | null) => {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const greetingsWithName = [
    `${timeGreeting}, ${firstName}`,
    `${timeGreeting}, ${firstName}`,
    `Hey, ${firstName}. Ready to dive in?`,
    "What can I help you find today?",
    "How can I help you today?",
    "What would you like to explore?",
  ];

  const greetingsWithoutName = [
    timeGreeting,
    timeGreeting,
    "Ready to dive in?",
    "What can I help you find today?",
    "How can I help you today?",
    "What would you like to explore?",
  ];

  const greetings = firstName ? greetingsWithName : greetingsWithoutName;
  return greetings[Math.floor(Math.random() * greetings.length)];
};

export function MessageList({
  messages,
  hasIndexedFiles,
  onOpenSettings,
  renderInput,
}: MessageListProps) {
  const { user } = useUser();
  const firstName = user?.firstName || null;
  const greetingRef = useRef<string | null>(null);

  if (greetingRef.current === null && firstName !== null) {
    greetingRef.current = getGreeting(firstName);
  } else if (greetingRef.current === null) {
    greetingRef.current = getGreeting(null);
  }

  const greeting = greetingRef.current;
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currentCount = messages.length;
    prevMessageCountRef.current = currentCount;

    const isConversationSwitch =
      currentCount === 0 || Math.abs(currentCount - prevCount) > 1;

    bottomRef.current?.scrollIntoView({
      behavior: isConversationSwitch ? "instant" : "smooth",
    });
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
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{greeting}</h1>
        </div>
        <div className="w-full max-w-2xl">{renderInput}</div>
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
