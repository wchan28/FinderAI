import { PanelLeft } from "lucide-react";

type SidebarToggleProps = {
  onClick: () => void;
  isOpen: boolean;
};

export function SidebarToggle({ onClick, isOpen }: SidebarToggleProps) {
  return (
    <button
      onClick={onClick}
      className="no-drag p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-colors"
      title={isOpen ? "Close sidebar  ⌘." : "Open sidebar  ⌘."}
    >
      <PanelLeft className="w-[18px] h-[18px]" />
    </button>
  );
}
