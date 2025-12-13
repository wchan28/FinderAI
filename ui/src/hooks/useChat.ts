import { useState, useCallback } from 'react'
import { streamChat, Source } from '../api/client'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  isStreaming?: boolean
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    }

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setIsLoading(true)

    let sources: Source[] = []

    await streamChat(content, {
      onChunk: (chunk) => {
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.content += chunk
          }
          return updated
        })
      },
      onSources: (newSources) => {
        sources = newSources
      },
      onDone: () => {
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.isStreaming = false
            lastMsg.sources = sources
          }
          return updated
        })
        setIsLoading(false)
      },
      onError: (error) => {
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.content = `Error: ${error}`
            lastMsg.isStreaming = false
          }
          return updated
        })
        setIsLoading(false)
      },
    })
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  }
}
