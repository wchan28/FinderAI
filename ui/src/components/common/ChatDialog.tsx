import { useState, useEffect, useCallback, useRef } from "react";

type DeleteDialogProps = {
  mode: "delete";
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

type RenameDialogProps = {
  mode: "rename";
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onConfirm: (newTitle: string) => void;
};

type ChatDialogProps = DeleteDialogProps | RenameDialogProps;

export function ChatDialog(props: ChatDialogProps) {
  const { mode, isOpen, onClose } = props;
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && mode === "rename") {
      setInputValue((props as RenameDialogProps).initialValue);
    }
  }, [isOpen, mode, props]);

  useEffect(() => {
    if (isOpen && mode === "rename" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen, mode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleConfirm = () => {
    if (mode === "delete") {
      (props as DeleteDialogProps).onConfirm();
    } else {
      const trimmed = inputValue.trim();
      if (trimmed) {
        (props as RenameDialogProps).onConfirm(trimmed);
      }
    }
    onClose();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-stone-100 rounded-2xl shadow-2xl w-[400px] mx-4 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {mode === "delete" ? "Delete chat" : "Rename chat"}
        </h2>

        {mode === "delete" ? (
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete this chat?
          </p>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="w-full px-4 py-3 text-gray-900 bg-white border-2 border-blue-400 rounded-xl outline-none focus:border-blue-500 mb-6"
          />
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-full font-medium transition-colors ${
              mode === "delete"
                ? "bg-red-700 text-white hover:bg-red-800"
                : "bg-gray-900 text-white hover:bg-gray-800"
            }`}
          >
            {mode === "delete" ? "Delete" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
