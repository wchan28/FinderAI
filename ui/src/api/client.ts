const API_BASE = "http://127.0.0.1:8000";

export interface Source {
  file_name: string;
  file_path: string;
  slide_number: number;
  relevance_score: number;
}

export interface StatusResponse {
  total_chunks: number;
  indexed_files: number;
  files: Array<{
    file_path: string;
    file_name: string;
    chunk_count: number;
    indexed_at: string;
  }>;
}

export interface SkippedFile {
  file_path?: string;
  file_name: string;
  reason: string;
  chunks_would_be?: number;
}

export interface SkippedByReason {
  scanned_image: SkippedFile[];
  empty_file: SkippedFile[];
  file_too_large: SkippedFile[];
  unsupported_type: SkippedFile[];
  chunk_limit_exceeded: SkippedFile[];
}

export interface IndexStats {
  total_files: number;
  indexed_files: number;
  skipped_unchanged: number;
  skipped_limits: number;
  total_chunks: number;
  total_time: number;
  errors: string[];
  skipped_files: SkippedFile[];
  skipped_by_reason: SkippedByReason;
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_BASE}/api/status`);
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}

export interface HealthResponse {
  status: string;
  embedding_ready: boolean;
  llm_ready: boolean;
  needs_setup: boolean;
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Backend not available");
  return res.json();
}

export interface ModelInfo {
  name: string;
  label: string;
  size: string;
}

export async function getAvailableModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error("Failed to get models");
  const data = await res.json();
  return data.models;
}

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void;
  onSources: (sources: Source[]) => void;
  onHiddenResults?: (hiddenResults: HiddenResults) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamChat(
  message: string,
  callbacks: ChatStreamCallbacks,
  abortSignal?: AbortSignal,
  clerkToken?: string,
  conversationHistory?: ConversationMessage[],
  previousSources?: string[],
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clerkToken) {
    headers["x-clerk-auth-token"] = clerkToken;
  }

  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory ?? [],
      previous_sources: previousSources,
    }),
    signal: abortSignal,
  });

  if (!res.ok) {
    callbacks.onError("Failed to send message");
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") {
            callbacks.onChunk(data.content);
          } else if (data.type === "sources") {
            callbacks.onSources(data.content);
          } else if (data.type === "hidden_results") {
            callbacks.onHiddenResults?.(data.content);
          } else if (data.type === "done") {
            callbacks.onDone();
          } else if (data.type === "error") {
            callbacks.onError(data.content);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

export interface IndexStreamCallbacks {
  onProgress: (message: string) => void;
  onStats: (stats: IndexStats) => void;
  onCancelled: (stats: IndexStats) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamIndex(
  folder: string,
  maxChunks: number,
  maxFileSizeMb: number,
  force: boolean,
  callbacks: IndexStreamCallbacks,
  clerkToken?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clerkToken) {
    headers["x-clerk-auth-token"] = clerkToken;
  }

  const res = await fetch(`${API_BASE}/api/index`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      folder,
      max_chunks: maxChunks,
      max_file_size_mb: maxFileSizeMb,
      force,
    }),
  });

  if (!res.ok) {
    callbacks.onError("Failed to start indexing");
    return;
  }

  await processSSEStream(res, callbacks);
}

export async function streamReindex(
  maxChunks: number,
  maxFileSizeMb: number,
  callbacks: IndexStreamCallbacks,
  clerkToken?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clerkToken) {
    headers["x-clerk-auth-token"] = clerkToken;
  }

  const res = await fetch(`${API_BASE}/api/reindex`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      max_chunks: maxChunks,
      max_file_size_mb: maxFileSizeMb,
    }),
  });

  if (!res.ok) {
    callbacks.onError("Failed to start reindexing");
    return;
  }

  await processSSEStream(res, callbacks);
}

export async function streamIndexSkipped(
  maxChunks: number,
  maxFileSizeMb: number,
  callbacks: IndexStreamCallbacks,
  clerkToken?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clerkToken) {
    headers["x-clerk-auth-token"] = clerkToken;
  }

  const res = await fetch(`${API_BASE}/api/index/skipped`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      max_chunks: maxChunks,
      max_file_size_mb: maxFileSizeMb,
    }),
  });

  if (!res.ok) {
    callbacks.onError("Failed to start indexing skipped files");
    return;
  }

  await processSSEStream(res, callbacks);
}

async function processSSEStream(
  res: Response,
  callbacks: IndexStreamCallbacks,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress") {
            callbacks.onProgress(data.content);
          } else if (data.type === "stats") {
            callbacks.onStats(data.content);
          } else if (data.type === "cancelled") {
            callbacks.onCancelled(data.content);
          } else if (data.type === "done") {
            callbacks.onDone();
          } else if (data.type === "error") {
            callbacks.onError(data.content);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

export async function cancelIndex(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/index/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to cancel indexing");
  return res.json();
}

export interface Settings {
  llm_provider: string;
  llm_model: string;
  embedding_provider: string;
  embedding_model: string;
  reranking_provider: string;
  reranking_model: string;
  hybrid_search_enabled: boolean;
  initial_results: number;
  rerank_to: number;
  has_openai_key: boolean;
  has_google_key: boolean;
  has_cohere_key: boolean;
  has_voyage_key: boolean;
  indexed_folder: string | null;
}

export interface ProviderModels {
  llm_providers: Record<string, string[]>;
  embedding_providers: Record<string, string[]>;
  reranking_providers: string[];
}

export async function getSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error("Failed to get settings");
  return res.json();
}

export async function updateSettings(
  settings: Partial<Settings>,
): Promise<Settings> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export async function saveApiKey(
  provider: string,
  apiKey: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  if (!res.ok) throw new Error("Failed to save API key");
}

export async function deleteApiKey(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/api-key/${provider}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete API key");
}

export async function getProviderModels(): Promise<ProviderModels> {
  const res = await fetch(`${API_BASE}/api/settings/providers`);
  if (!res.ok) throw new Error("Failed to get providers");
  return res.json();
}

export async function clearIndex(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/clear-index`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to clear index");
  return res.json();
}

export async function getIndexingResults(): Promise<IndexStats | null> {
  const res = await fetch(`${API_BASE}/api/indexing-results`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.has_results === false) return null;
  return data as IndexStats;
}

export interface JobInfo {
  id: number;
  folder: string;
  files_total: number;
  files_processed: number;
  status: string;
  progress_percent: number;
}

export interface JobStatusResponse {
  has_incomplete_job: boolean;
  job_info?: JobInfo;
}

export async function getJobStatus(): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/api/index/job-status`);
  if (!res.ok) throw new Error("Failed to get job status");
  return res.json();
}

export async function pauseIndex(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/index/pause`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to pause indexing");
  return res.json();
}

export async function discardJob(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/index/discard-job`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to discard job");
  return res.json();
}

export interface ResumeStreamCallbacks {
  onProgress: (message: string) => void;
  onStats: (stats: IndexStats) => void;
  onPaused: (stats: IndexStats) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export interface SubscriptionLimits {
  max_indexed_files: number;
  max_searches_per_month: number;
  conversation_history_days: number;
}

export interface SubscriptionUsage {
  indexed_files: number;
  searches_this_month: number;
  archived_files: number;
}

export interface GracePeriodInfo {
  in_grace_period: boolean;
  days_remaining: number;
  archive_deadline: string | null;
  files_to_archive_count: number;
  files_to_archive: string[];
}

export interface SubscriptionResponse {
  tier: "free" | "pro";
  is_trial: boolean;
  trial_days_remaining: number | null;
  is_beta_user: boolean;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  allowed_file_types: string[];
  grace_period: GracePeriodInfo;
}

export interface HiddenResults {
  count: number;
  extensions: string[];
}

export async function getSubscription(
  authToken?: string,
  userEmail?: string,
): Promise<SubscriptionResponse> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (userEmail) {
    headers["X-User-Email"] = userEmail;
  }

  const res = await fetch(`${API_BASE}/api/subscription`, { headers });
  if (!res.ok) throw new Error("Failed to get subscription");
  return res.json();
}

export type BillingPeriod = "monthly" | "annual";

export interface StripeSubscriptionStatus {
  status: string;
  customer_id: string | null;
  subscription_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
  plan_interval: string | null;
}

export async function createCheckoutSession(
  billingPeriod: BillingPeriod,
  successUrl: string,
  cancelUrl: string,
  authToken?: string,
  userEmail?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (userEmail) {
    headers["X-User-Email"] = userEmail;
  }

  const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      billing_period: billingPeriod,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create checkout session");
  }

  const data = await res.json();
  return data.checkout_url;
}

export async function getStripeSubscription(
  authToken?: string,
  userEmail?: string,
): Promise<StripeSubscriptionStatus> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (userEmail) {
    headers["X-User-Email"] = userEmail;
  }

  const res = await fetch(`${API_BASE}/api/stripe/subscription`, { headers });
  if (!res.ok) {
    throw new Error("Failed to get Stripe subscription status");
  }

  return res.json();
}

export async function createCustomerPortalSession(
  authToken?: string,
  userEmail?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  if (userEmail) {
    headers["X-User-Email"] = userEmail;
  }

  const res = await fetch(`${API_BASE}/api/stripe/portal`, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    throw new Error("Failed to create portal session");
  }

  const data = await res.json();
  return data.portal_url;
}

export async function streamResume(
  jobId: number,
  callbacks: ResumeStreamCallbacks,
  clerkToken?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clerkToken) {
    headers["x-clerk-auth-token"] = clerkToken;
  }

  const res = await fetch(`${API_BASE}/api/index/resume`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job_id: jobId }),
  });

  if (!res.ok) {
    callbacks.onError("Failed to resume indexing");
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress") {
            callbacks.onProgress(data.content);
          } else if (data.type === "stats") {
            callbacks.onStats(data.content);
          } else if (data.type === "paused") {
            callbacks.onPaused(data.content);
          } else if (data.type === "done") {
            callbacks.onDone();
          } else if (data.type === "error") {
            callbacks.onError(data.content);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}
