import { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Brain,
  Search,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  getSettings,
  updateSettings,
  saveApiKey,
  deleteApiKey,
  getProviderModels,
  type Settings,
  type ProviderModels,
} from "../../api/client";

type APIKeyInputProps = {
  label: string;
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

function APIKeyInput({ label, hasKey, onSave, onDelete }: APIKeyInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setValue("");
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing && hasKey) {
    return (
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-green-500" />
        <span className="text-sm text-green-600">{label} configured</span>
        <button
          onClick={() => setIsEditing(true)}
          className="text-xs text-blue-500 hover:text-blue-600 ml-2"
        >
          Change
        </button>
        <button
          onClick={handleDelete}
          disabled={saving}
          className="text-xs text-red-500 hover:text-red-600"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
        </button>
      </div>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <Key className="w-4 h-4" />
        Add {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          type={showKey ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Enter ${label}`}
          className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showKey ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
      <button
        onClick={handleSave}
        disabled={!value.trim() || saving}
        className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={() => {
          setIsEditing(false);
          setValue("");
        }}
        className="p-1.5 text-gray-400 hover:bg-gray-50 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

type ProviderSettingsProps = {
  onRunSetup?: () => void;
};

export function ProviderSettings({ onRunSetup }: ProviderSettingsProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProviderModels | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [settingsData, providersData] = await Promise.all([
        getSettings(),
        getProviderModels(),
      ]);
      setSettings(settingsData);
      setProviders(providersData);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSettingChange = async (
    key: keyof Settings,
    value: string | boolean | number,
  ) => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateSettings({ [key]: value });
      setSettings(updated);
    } catch (error) {
      console.error("Failed to update setting:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async (provider: string, key: string) => {
    await saveApiKey(provider, key);
    await loadData();
  };

  const handleDeleteApiKey = async (provider: string) => {
    await deleteApiKey(provider);
    await loadData();
  };

  const handleLLMProviderChange = async (newProvider: string) => {
    if (!settings || !providers) return;
    setSaving(true);
    try {
      const newModels = providers.llm_providers[newProvider] || [];
      const newModel = newModels[0] || "";
      const updated = await updateSettings({
        llm_provider: newProvider,
        llm_model: newModel,
      });
      setSettings(updated);
    } catch (error) {
      console.error("Failed to update LLM provider:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleEmbeddingProviderChange = async (newProvider: string) => {
    if (!settings || !providers) return;
    setSaving(true);
    try {
      const newModels = providers.embedding_providers[newProvider] || [];
      const newModel = newModels[0] || "";
      const updated = await updateSettings({
        embedding_provider: newProvider,
        embedding_model: newModel,
      });
      setSettings(updated);
    } catch (error) {
      console.error("Failed to update embedding provider:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!settings || !providers) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
        Failed to load settings. Make sure the backend is running.
      </div>
    );
  }

  const llmModels = providers.llm_providers[settings.llm_provider] || [];
  const embeddingModels =
    providers.embedding_providers[settings.embedding_provider] || [];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Keys
          </h4>
          {onRunSetup && (
            <button
              onClick={onRunSetup}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Run Setup Wizard
            </button>
          )}
        </div>
        <div className="space-y-2 pl-6">
          <APIKeyInput
            label="OpenAI API Key"
            hasKey={settings.has_openai_key}
            onSave={(key) => handleSaveApiKey("openai", key)}
            onDelete={() => handleDeleteApiKey("openai")}
          />
          <APIKeyInput
            label="Google API Key"
            hasKey={settings.has_google_key}
            onSave={(key) => handleSaveApiKey("google", key)}
            onDelete={() => handleDeleteApiKey("google")}
          />
          <APIKeyInput
            label="Cohere API Key"
            hasKey={settings.has_cohere_key}
            onSave={(key) => handleSaveApiKey("cohere", key)}
            onDelete={() => handleDeleteApiKey("cohere")}
          />
          <APIKeyInput
            label="Voyage AI API Key"
            hasKey={settings.has_voyage_key}
            onSave={(key) => handleSaveApiKey("voyage", key)}
            onDelete={() => handleDeleteApiKey("voyage")}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Brain className="w-4 h-4" />
          LLM Provider
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={settings.llm_provider}
              onChange={(e) => handleLLMProviderChange(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
            >
              {Object.keys(providers.llm_providers).map((provider) => (
                <option key={provider} value={provider}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model</label>
            <select
              value={settings.llm_model}
              onChange={(e) => handleSettingChange("llm_model", e.target.value)}
              disabled={saving || llmModels.length === 0}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
            >
              {llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Embedding Provider
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={settings.embedding_provider}
              onChange={(e) => handleEmbeddingProviderChange(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
            >
              {Object.keys(providers.embedding_providers).map((provider) => (
                <option key={provider} value={provider}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model</label>
            <select
              value={settings.embedding_model}
              onChange={(e) =>
                handleSettingChange("embedding_model", e.target.value)
              }
              disabled={saving || embeddingModels.length === 0}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
            >
              {embeddingModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-amber-600 pl-1">
          Changing embedding model requires re-indexing all files.
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Search & Reranking
        </h4>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hybrid_search_enabled}
              onChange={(e) =>
                handleSettingChange("hybrid_search_enabled", e.target.checked)
              }
              disabled={saving}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Enable Hybrid Search (BM25 + Vector)
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Reranking Provider
              </label>
              <select
                value={settings.reranking_provider}
                onChange={(e) =>
                  handleSettingChange("reranking_provider", e.target.value)
                }
                disabled={saving}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
              >
                {providers.reranking_providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === "none"
                      ? "None (disabled)"
                      : provider === "cross_encoder"
                        ? "Cross-Encoder (free, local)"
                        : provider === "llm"
                          ? "LLM-based"
                          : provider.charAt(0).toUpperCase() +
                            provider.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Rerank Top-N
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={settings.rerank_to}
                onChange={(e) =>
                  handleSettingChange("rerank_to", parseInt(e.target.value, 10))
                }
                disabled={saving || settings.reranking_provider === "none"}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Initial Results to Retrieve: {settings.initial_results}
            </label>
            <input
              type="range"
              min={20}
              max={100}
              step={10}
              value={settings.initial_results}
              onChange={(e) =>
                handleSettingChange(
                  "initial_results",
                  parseInt(e.target.value, 10),
                )
              }
              disabled={saving}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">
              Higher values improve recall but increase processing time.
            </p>
          </div>
        </div>
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </div>
      )}
    </div>
  );
}
