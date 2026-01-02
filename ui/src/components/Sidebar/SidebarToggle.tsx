import { useState } from "react";
import { PanelLeft } from "lucide-react";

type SidebarToggleProps = {
  onClick: () => void;
  isOpen: boolean;
};

export function SidebarToggle({ onClick, isOpen }: SidebarToggleProps) {
  const [hideTooltip, setHideTooltip] = useState(false);

  const handleClick = () => {
    setHideTooltip(true);
    onClick();
  };

  const handleMouseLeave = () => {
    setHideTooltip(false);
  };

  return (
    <div className="relative group" onMouseLeave={handleMouseLeave}>
      <button
        onClick={handleClick}
        className="no-drag p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-colors"
      >
        <PanelLeft className="w-[18px] h-[18px]" />
      </button>
      <div
        className={`absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap pointer-events-none ${
          hideTooltip ? "opacity-0" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {isOpen ? "Close sidebar" : "Open sidebar"}
      </div>
    </div>
  );
}
