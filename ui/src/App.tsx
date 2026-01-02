import { useEffect, useState, useCallback, useRef } from "react";
import { ChatContainer } from "./components/Chat/ChatContainer";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { SetupWizard } from "./components/Onboarding/SetupWizard";
import { ChatSidebar } from "./components/Sidebar/ChatSidebar";
import { SidebarToggle } from "./components/Sidebar/SidebarToggle";
import { AuthGate } from "./components/Auth/AuthGate";
import { checkHealth, getStatus } from "./api/client";
import type { StatusResponse } from "./api/client";
import { useChat } from "./hooks/useChat";
import type { Message } from "./hooks/useChat";
import { useChatHistory } from "./hooks/useChatHistory";
import { AlertCircle, Loader2 } from "lucide-react";

const SETUP_COMPLETE_KEY = "finderai_setup_complete";
const SIDEBAR_OPEN_KEY = "finderai_sidebar_state";

function App() {
  const [backendStatus, setBackendStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored === "true";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<StatusResponse | null>(null);

  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    clearActiveConversation,
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
        const newId = createConversation();
        activeConversationIdRef.current = newId;
      }
      await sendMessage(content);
    },
    [createConversation, sendMessage],
  );

  const handleNewChat = useCallback(() => {
    if (!activeConversationId) {
      return;
    }
    if (activeConversation && activeConversation.messages.length === 0) {
      return;
    }
    clearActiveConversation();
  }, [activeConversationId, activeConversation, clearActiveConversation]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const newValue = !prev;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(newValue));
      return newValue;
    });
  }, []);

  const refreshIndexStatus = useCallback(async () => {
    try {
      const status = await getStatus();
      setIndexStatus(status);
    } catch {
      // Ignore - status won't update
    }
  }, []);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const health = await checkHealth();
        setBackendStatus("ready");
        setLlmReady(health.llm_ready);

        const status = await getStatus();
        setIndexStatus(status);

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
      <div className="h-full flex items-center justify-center bg-gray-50 relative">
        <div className="drag-region absolute top-0 left-0 right-0 h-12" />
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
      <div className="h-full flex items-center justify-center bg-gray-50 relative">
        <div className="drag-region absolute top-0 left-0 right-0 h-12" />
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
    return (
      <AuthGate>
        <div className="h-full relative">
          <div className="drag-region absolute top-0 left-0 right-0 h-12 z-50" />
          <SetupWizard onComplete={handleSetupComplete} />
        </div>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <div className="h-full flex flex-col bg-white relative">
        <div className="drag-region absolute top-0 left-0 right-0 h-12 z-50 flex">
          <div className={`h-full transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-64 bg-gray-50 border-r border-gray-200" : "w-0 bg-transparent"}`} />
          <div className="absolute left-[78px] top-1/2 -translate-y-1/2">
            <SidebarToggle onClick={handleToggleSidebar} isOpen={isSidebarOpen} />
          </div>
          <div className="flex-1" />
        </div>
        <div className="flex-1 flex overflow-hidden relative pt-12">
          {needsSetup && (
            <div className="absolute top-0 left-0 right-0 bg-yellow-50 border-b border-yellow-200 pl-20 pr-4 py-3 text-sm text-yellow-800 flex items-center gap-2 z-40">
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
            <div className="absolute top-0 left-0 right-0 bg-yellow-50 border-b border-yellow-200 pl-20 pr-4 py-3 text-sm text-yellow-800 flex items-center gap-2 z-40">
              <AlertCircle className="w-4 h-4 no-drag" />
              <span className="no-drag">
                LLM not configured. Chat functionality may be limited.
              </span>
            </div>
          )}
          <ChatSidebar
            isOpen={isSidebarOpen}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={selectConversation}
            onNewChat={handleNewChat}
            onRenameConversation={renameConversation}
            onDeleteConversation={deleteConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ChatContainer
                messages={messages}
                isLoading={isLoading}
                onSendMessage={handleSendMessage}
                onStopGeneration={stopGeneration}
                hasIndexedFiles={(indexStatus?.indexed_files ?? 0) > 0}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>
          </div>
        </div>

        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            refreshIndexStatus();
          }}
          onRunSetup={handleRunSetup}
        />
      </div>
    </AuthGate>
  );
}

export default App;
