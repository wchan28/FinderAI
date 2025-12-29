import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { FileText, User } from "lucide-react";
import type { Message } from "../../hooks/useChat";
import { getSettings } from "../../api/client";
import type { Source } from "../../api/client";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface MessageBubbleProps {
  message: Message;
}

let cachedIndexedFolder: string | null = null;
let folderFetchPromise: Promise<string | null> | null = null;

async function getIndexedFolder(): Promise<string | null> {
  if (cachedIndexedFolder !== null) {
    return cachedIndexedFolder;
  }
  if (folderFetchPromise) {
    return folderFetchPromise;
  }
  folderFetchPromise = getSettings()
    .then((settings) => {
      cachedIndexedFolder = settings.indexed_folder;
      return cachedIndexedFolder;
    })
    .catch(() => null);
  return folderFetchPromise;
}

function buildAbsolutePath(
  relativePath: string,
  indexedFolder: string | null,
): string {
  if (!indexedFolder) {
    return relativePath;
  }
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    return relativePath;
  }
  if (/^[A-Za-z]:/.test(relativePath)) {
    return relativePath;
  }
  const separator = indexedFolder.includes("\\") ? "\\" : "/";
  const cleanBase = indexedFolder.endsWith(separator)
    ? indexedFolder.slice(0, -1)
    : indexedFolder;
  return `${cleanBase}${separator}${relativePath}`;
}

function openFile(filePath: string, indexedFolder: string | null): void {
  const absolutePath = buildAbsolutePath(filePath, indexedFolder);
  console.log("[openFile] Relative path:", filePath);
  console.log("[openFile] Indexed folder:", indexedFolder);
  console.log("[openFile] Absolute path:", absolutePath);
  if (window.electronAPI) {
    window.electronAPI
      .openFile(absolutePath)
      .then((result) => {
        console.log("[openFile] Result:", result || "Success (empty string)");
      })
      .catch((err) => {
        console.error("[openFile] Error:", err);
      });
  } else {
    console.warn("[openFile] electronAPI not available");
  }
}

function buildFilePathLookup(
  sources: Source[] | undefined,
): Map<string, string> {
  const lookup = new Map<string, string>();
  if (!sources) return lookup;
  for (const source of sources) {
    lookup.set(source.file_name, source.file_path);
  }
  return lookup;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const showThinkingIndicator =
    message.isStreaming && !message.content && message.status;
  const filePathLookup = buildFilePathLookup(message.sources);
  const [indexedFolder, setIndexedFolder] = useState<string | null>(
    cachedIndexedFolder,
  );

  useEffect(() => {
    if (cachedIndexedFolder === null) {
      getIndexedFolder().then(setIndexedFolder);
    }
  }, []);

  const handleOpenFile = (filePath: string) => {
    openFile(filePath, indexedFolder);
  };

  const markdownComponents: Components = {
    strong: ({ children }) => {
      const text = String(children);
      const filePath = filePathLookup.get(text);
      if (filePath) {
        return (
          <strong
            className="cursor-pointer text-blue-600 hover:text-blue-800 hover:underline"
            onClick={() => handleOpenFile(filePath)}
            title={`Open ${filePath}`}
          >
            {children}
          </strong>
        );
      }
      return <strong>{children}</strong>;
    },
  };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-500" : "bg-gray-700"
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <FileText className="w-5 h-5 text-white" />
        )}
      </div>

      <div className={`flex-1 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-3 ${
            isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : showThinkingIndicator ? (
            <ThinkingIndicator status={message.status ?? null} />
          ) : (
            <div className="prose prose-sm max-w-none prose-ul:list-disc prose-ul:pl-4 prose-li:my-0.5 prose-p:my-1 prose-strong:font-semibold">
              <ReactMarkdown components={markdownComponents}>
                {message.content || "..."}
              </ReactMarkdown>
            </div>
          )}

          {message.isStreaming && message.content && (
            <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            <span className="font-medium">Sources:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {message.sources.map((source, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 rounded-full hover:bg-gray-300 cursor-pointer"
                  title={source.file_path}
                  onClick={() => handleOpenFile(source.file_path)}
                >
                  <FileText className="w-3 h-3" />
                  {source.file_name}
                  <span className="text-gray-400">
                    ({Math.round(source.relevance_score * 100)}%)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
