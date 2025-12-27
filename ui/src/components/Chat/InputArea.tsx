import { useState, useCallback, KeyboardEvent } from "react";
import { Send, StopCircle } from "lucide-react";

interface InputAreaProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function InputArea({
  onSend,
  onStop,
  disabled,
  isLoading,
}: InputAreaProps) {
  const [input, setInput] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setInput("");
    }
  }, [input, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-white px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your files..."
            className="flex-1 bg-transparent resize-none outline-none text-gray-900 placeholder-gray-400 max-h-32"
            rows={1}
            disabled={disabled}
          />
          {isLoading ? (
            <button
              onClick={onStop}
              className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
              title="Stop generation"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={disabled || !input.trim()}
              className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
