import { Loader2, Search, Sparkles, MessageSquare } from "lucide-react";

export type ThinkingStatus = "searching" | "thinking" | "generating" | null;

interface ThinkingIndicatorProps {
  status: ThinkingStatus;
}

const statusConfig = {
  searching: {
    icon: Search,
    text: "Searching documents...",
    color: "text-blue-500",
  },
  thinking: {
    icon: Sparkles,
    text: "Thinking...",
    color: "text-purple-500",
  },
  generating: {
    icon: MessageSquare,
    text: "Generating response...",
    color: "text-green-500",
  },
};

export function ThinkingIndicator({ status }: ThinkingIndicatorProps) {
  if (!status) return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="relative">
        <Loader2 className={`w-5 h-5 ${config.color} animate-spin`} />
        <Icon
          className={`w-3 h-3 ${config.color} absolute -bottom-1 -right-1 bg-gray-100 rounded-full p-0.5`}
        />
      </div>
      <span className={`text-sm ${config.color} animate-pulse font-medium`}>
        {config.text}
      </span>
      <div className="flex gap-1">
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}
