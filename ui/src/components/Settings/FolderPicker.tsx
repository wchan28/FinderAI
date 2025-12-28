import { useState, useEffect } from "react";
import { FolderOpen } from "lucide-react";

type FolderPickerProps = {
  onSelect: (folder: string) => void;
  disabled?: boolean;
  value?: string;
};

export function FolderPicker({
  onSelect,
  disabled,
  value = "",
}: FolderPickerProps) {
  const [folder, setFolder] = useState(value);

  useEffect(() => {
    setFolder(value);
  }, [value]);

  const handleBrowse = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectFolder();
      if (selected) {
        setFolder(selected);
        onSelect(selected);
      }
    } else {
      const path = prompt("Enter folder path:");
      if (path) {
        setFolder(path);
        onSelect(path);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={folder}
        onChange={(e) => {
          setFolder(e.target.value);
          onSelect(e.target.value);
        }}
        placeholder="Select a folder to index..."
        className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
        disabled={disabled}
      />
      <button
        onClick={handleBrowse}
        disabled={disabled}
        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
      >
        <FolderOpen className="w-5 h-5 text-gray-600" />
      </button>
    </div>
  );
}
