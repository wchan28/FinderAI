import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { useChat } from '../../hooks/useChat'

export function ChatContainer() {
  const { messages, isLoading, sendMessage } = useChat()

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <InputArea onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
