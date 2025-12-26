import { useEffect, useState, useCallback, useRef } from "react";
import { ChatContainer } from "./components/Chat/ChatContainer";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { SetupWizard } from "./components/Onboarding/SetupWizard";
import { ChatSidebar } from "./components/Sidebar/ChatSidebar";
import { SidebarToggle } from "./components/Sidebar/SidebarToggle";
import { checkHealth } from "./api/client";
import { useChat } from "./hooks/useChat";
import type { Message } from "./hooks/useChat";
import { useChatHistory } from "./hooks/useChatHistory";
import { AlertCircle, Loader2 } from "lucide-react";

const SETUP_COMPLETE_KEY = "finderai_setup_complete";
const SIDEBAR_OPEN_KEY = "finderai_sidebar_open";

function App() {
  const [backendStatus, setBackendStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored !== "false";
  });

  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    updateMessages,
  } = useChatHistory();

  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const handleMessagesChange = useCallback(
    (messages: Message[]) => {
      const id = activeConversationIdRef.current;
      if (id) {
        updateMessages(id, messages);
      }
    },
    [updateMessages],
  );

  const { messages, isLoading, sendMessage, stopGeneration } = useChat({
    conversationId: activeConversationId,
    initialMessages: activeConversation?.messages,
    onMessagesChange: handleMessagesChange,
  });

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeConversationIdRef.current) {
        createConversation();
      }
      await sendMessage(content);
    },
    [createConversation, sendMessage],
  );

  const handleNewChat = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const newValue = !prev;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(newValue));
      return newValue;
    });
  }, []);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const health = await checkHealth();
        setBackendStatus("ready");
        setLlmReady(health.llm_ready);

        const setupComplete = localStorage.getItem(SETUP_COMPLETE_KEY);
        if (health.needs_setup && !setupComplete) {
          setNeedsSetup(true);
          setShowSetupWizard(true);
        } else {
          setNeedsSetup(health.needs_setup);
        }
      } catch {
        setBackendStatus("error");
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSetupComplete = () => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "true");
    setShowSetupWizard(false);
    setNeedsSetup(false);
  };

  const handleRunSetup = () => {
    setShowSetupWizard(true);
  };

  if (backendStatus === "loading") {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Starting FinderAI...</p>
          <p className="text-sm text-gray-400 mt-1">Loading backend services</p>
        </div>
      </div>
    );
  }

  if (backendStatus === "error") {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-gray-900 font-medium">
            Backend Not Available
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Make sure the Python backend is running. Start it with:
          </p>
          <code className="block mt-2 p-2 bg-gray-100 rounded text-sm">
            python -m uvicorn backend.api.server:app
          </code>
        </div>
      </div>
    );
  }

  if (showSetupWizard) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {needsSetup && (
        <div className="drag-region bg-yellow-50 border-b border-yellow-200 pl-20 pr-4 py-3 text-sm text-yellow-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 no-drag" />
          <span className="no-drag">
            API keys not configured.{" "}
            <button
              onClick={handleRunSetup}
              className="underline hover:no-underline font-medium"
            >
              Run setup
            </button>{" "}
            to enable search.
          </span>
        </div>
      )}
      {!needsSetup && !llmReady && (
        <div className="drag-region bg-yellow-50 border-b border-yellow-200 pl-20 pr-4 py-3 text-sm text-yellow-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 no-drag" />
          <span className="no-drag">
            LLM not configured. Chat functionality may be limited.
          </span>
        </div>
      )}
      <SettingsPanel onRunSetup={handleRunSetup} />
      <div className="flex-1 flex overflow-hidden">
        <ChatSidebar
          isOpen={isSidebarOpen}
          onToggle={handleToggleSidebar}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={selectConversation}
          onNewChat={handleNewChat}
          onRenameConversation={renameConversation}
          onDeleteConversation={deleteConversation}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {!isSidebarOpen && (
            <div className="p-2 border-b border-gray-100">
              <SidebarToggle onClick={handleToggleSidebar} />
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatContainer
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onStopGeneration={stopGeneration}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
