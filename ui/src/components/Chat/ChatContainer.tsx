import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { useChat } from '../../hooks/useChat'

type ChatContainerProps = {
  model: string
}

export function ChatContainer({ model }: ChatContainerProps) {
  const { messages, isLoading, sendMessage } = useChat(model)

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <InputArea onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
