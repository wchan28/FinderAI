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
};

export function ChatContainer({
  messages,
  isLoading,
  onSendMessage,
  onStopGeneration,
  hasIndexedFiles,
  onOpenSettings,
}: ChatContainerProps) {
  return (
    <div className="flex flex-col h-full">
      <MessageList
        messages={messages}
        hasIndexedFiles={hasIndexedFiles}
        onOpenSettings={onOpenSettings}
      />
      <InputArea
        onSend={onSendMessage}
        onStop={onStopGeneration}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </div>
  );
}
