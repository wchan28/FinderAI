import { useState, useCallback, useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp, StopCircle } from "lucide-react";

interface InputAreaProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  variant?: "default" | "centered";
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function InputArea({
  onSend,
  onStop,
  disabled,
  isLoading,
  placeholder = "Ask a question about your files...",
  variant = "default",
  autoFocus = false,
  value,
  onChange,
}: InputAreaProps) {
  const [internalInput, setInternalInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = variant === "centered" ? 288 : 200;

  const isControlled = value !== undefined;
  const input = isControlled ? value : internalInput;

  const handleChange = useCallback(
    (newValue: string) => {
      if (onChange) {
        onChange(newValue);
      }
      if (!isControlled) {
        setInternalInput(newValue);
      }
    },
    [onChange, isControlled],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [input, maxHeight]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      handleChange("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [input, disabled, onSend, handleChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputContent = (
    <div className="flex items-end gap-2 bg-gray-100 rounded-2xl px-4 py-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent resize-none outline-none text-gray-900 placeholder-gray-400 overflow-y-auto leading-6 py-1.5"
        style={{ minHeight: "28px", maxHeight: `${maxHeight}px` }}
        rows={1}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors flex-shrink-0 mb-0.5"
          title="Stop generation"
        >
          <StopCircle className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="p-2 rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 mb-0.5"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );

  if (variant === "centered") {
    return inputContent;
  }

  return (
    <div className="bg-white px-4 py-4">
      <div className="max-w-3xl mx-auto">{inputContent}</div>
    </div>
  );
}
