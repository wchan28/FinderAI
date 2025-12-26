import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import type { Message } from "../../hooks/useChat";

type ChatContainerProps = {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
};

export function ChatContainer({
  messages,
  isLoading,
  onSendMessage,
  onStopGeneration,
}: ChatContainerProps) {
  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <InputArea
        onSend={onSendMessage}
        onStop={onStopGeneration}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </div>
  );
}
