import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import type { Message } from "../../hooks/useChat";

type ChatContainerProps = {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  hasIndexedFiles: boolean;
  onOpenSettings: () => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
};

export function ChatContainer({
  messages,
  isLoading,
  onSendMessage,
  onStopGeneration,
  hasIndexedFiles,
  onOpenSettings,
  inputValue,
  onInputChange,
}: ChatContainerProps) {
  const isLandingState = messages.length === 0 && hasIndexedFiles;

  return (
    <div className="flex flex-col h-full">
      <MessageList
        messages={messages}
        hasIndexedFiles={hasIndexedFiles}
        onOpenSettings={onOpenSettings}
        renderInput={
          isLandingState ? (
            <InputArea
              onSend={onSendMessage}
              onStop={onStopGeneration}
              disabled={isLoading}
              isLoading={isLoading}
              placeholder="Ask a question about your files..."
              variant="centered"
              autoFocus
              value={inputValue}
              onChange={onInputChange}
            />
          ) : undefined
        }
      />
      {!isLandingState && (
        <InputArea
          onSend={onSendMessage}
          onStop={onStopGeneration}
          disabled={isLoading || !hasIndexedFiles}
          isLoading={isLoading}
          placeholder={
            hasIndexedFiles
              ? "Ask a question about your files..."
              : "Index your files first to start asking questions..."
          }
          value={inputValue}
          onChange={onInputChange}
        />
      )}
    </div>
  );
}
