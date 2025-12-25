import { useState, useCallback, useRef } from 'react'
import { streamChat, Source } from '../api/client'
import type { ThinkingStatus } from '../components/Chat/ThinkingIndicator'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  isStreaming?: boolean
  status?: ThinkingStatus
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      setMessages(prev => {
        const updated = [...prev]
        const lastMsg = updated[updated.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
          lastMsg.isStreaming = false
          lastMsg.status = undefined
          if (!lastMsg.content) {
            lastMsg.content = '(Stopped)'
          }
        }
        return updated
      })
    }
  }, [])

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
      status: 'searching',
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setIsLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let sources: Source[] = []
    let hasReceivedChunk = false

    try {
      await streamChat(content, {
        onChunk: (chunk) => {
          setMessages(prev => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg.role === 'assistant') {
              lastMsg.content += chunk
              if (!hasReceivedChunk) {
                hasReceivedChunk = true
                lastMsg.status = 'generating'
              }
            }
            return updated
          })
        },
        onSources: (newSources) => {
          sources = newSources
          setMessages(prev => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg.role === 'assistant' && !hasReceivedChunk) {
              lastMsg.status = 'thinking'
            }
            return updated
          })
        },
        onDone: () => {
          setMessages(prev => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg.role === 'assistant') {
              lastMsg.isStreaming = false
              lastMsg.sources = sources
              lastMsg.status = undefined
            }
            return updated
          })
          setIsLoading(false)
          abortControllerRef.current = null
        },
        onError: (error) => {
          setMessages(prev => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg.role === 'assistant') {
              lastMsg.content = `Error: ${error}`
              lastMsg.isStreaming = false
              lastMsg.status = undefined
            }
            return updated
          })
          setIsLoading(false)
          abortControllerRef.current = null
        },
      }, controller.signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setMessages(prev => {
        const updated = [...prev]
        const lastMsg = updated[updated.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.content = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
          lastMsg.isStreaming = false
          lastMsg.status = undefined
        }
        return updated
      })
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
  }
}
