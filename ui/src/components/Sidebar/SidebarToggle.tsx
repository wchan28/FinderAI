import { PanelLeftOpen } from "lucide-react";

type SidebarToggleProps = {
  onClick: () => void;
};

export function SidebarToggle({ onClick }: SidebarToggleProps) {
  return (
    <button
      onClick={onClick}
      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      title="Open sidebar"
    >
      <PanelLeftOpen className="w-5 h-5" />
    </button>
  );
}
