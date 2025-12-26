import { useState } from "react";
import { saveApiKey, getSettings } from "../../api/client";
import {
  Search,
  Sparkles,
  Key,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";

type Step = "welcome" | "embedding" | "llm" | "complete";

type SetupWizardProps = {
  onComplete: () => void;
};

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [voyageKey, setVoyageKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoyageKey, setShowVoyageKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  const verifyAndSaveEmbeddingKey = async () => {
    if (!voyageKey.trim()) {
      setError("Please enter your Voyage AI API key");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await saveApiKey("voyage", voyageKey.trim());
      const settings = await getSettings();
      if (settings.has_voyage_key) {
        setStep("llm");
      } else {
        setError("Failed to save API key. Please try again.");
      }
    } catch {
      setError("Failed to save API key. Please check your key and try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const verifyAndSaveLLMKey = async () => {
    if (!openaiKey.trim()) {
      setError("Please enter your OpenAI API key");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await saveApiKey("openai", openaiKey.trim());
      const settings = await getSettings();
      if (settings.has_openai_key) {
        setStep("complete");
      } else {
        setError("Failed to save API key. Please try again.");
      }
    } catch {
      setError("Failed to save API key. Please check your key and try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const skipLLMSetup = () => {
    setStep("complete");
  };

  const steps: Step[] = ["welcome", "embedding", "llm", "complete"];

  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <div className="max-w-lg w-full mx-4">
        {step !== "welcome" && step !== "complete" && (
          <div className="flex justify-center gap-2 mb-8">
            {["embedding", "llm"].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  steps.indexOf(step) > i + 1
                    ? "bg-blue-500"
                    : step === s
                      ? "bg-blue-500"
                      : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        )}

        {step === "welcome" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Search className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              Welcome to FinderAI
            </h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Search your local files using natural language. Ask questions
              about your documents and get instant answers.
            </p>
            <button
              onClick={() => setStep("embedding")}
              className="inline-flex items-center gap-2 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Get Started
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === "embedding" && (
          <div>
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-purple-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Set up file search
            </h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              To search your files, FinderAI uses Voyage AI to understand your
              documents. You'll need an API key to get started.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-gray-900 mb-2 text-sm">
                How to get your API key:
              </h3>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex gap-2">
                  <span className="text-gray-400">1.</span>
                  <span>
                    Go to{" "}
                    <a
                      href="https://dash.voyageai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      Voyage AI Dashboard
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">2.</span>
                  <span>Sign up or log in (free tier available)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">3.</span>
                  <span>Create a new API key and copy it</span>
                </li>
              </ol>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Voyage AI API Key
              </label>
              <div className="relative">
                <input
                  type={showVoyageKey ? "text" : "password"}
                  value={voyageKey}
                  onChange={(e) => {
                    setVoyageKey(e.target.value);
                    setError(null);
                  }}
                  placeholder="pa-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowVoyageKey(!showVoyageKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showVoyageKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <button
              onClick={verifyAndSaveEmbeddingKey}
              disabled={isVerifying}
              className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {step === "llm" && (
          <div>
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-4">
              <Key className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Set up AI chat
            </h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              To ask questions about your files, FinderAI uses OpenAI's GPT
              models. Add your API key to enable chat.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-gray-900 mb-2 text-sm">
                How to get your API key:
              </h3>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex gap-2">
                  <span className="text-gray-400">1.</span>
                  <span>
                    Go to{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      OpenAI Platform
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">2.</span>
                  <span>Sign up or log in</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gray-400">3.</span>
                  <span>Create a new API key and copy it</span>
                </li>
              </ol>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => {
                    setOpenaiKey(e.target.value);
                    setError(null);
                  }}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOpenaiKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={skipLLMSetup}
                className="flex-1 px-4 py-2.5 text-gray-600 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors text-sm"
              >
                Skip for now
              </button>
              <button
                onClick={verifyAndSaveLLMKey}
                disabled={isVerifying}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              You're all set!
            </h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Start by indexing a folder with your documents, then ask questions
              about your files.
            </p>
            <button
              onClick={onComplete}
              className="inline-flex items-center gap-2 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              Start Using FinderAI
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
