import { useState, useRef, useEffect } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { Settings, LogOut, Zap, Crown, Sparkles } from "lucide-react";
import { useSubscription } from "../../providers/SubscriptionProvider";

type UserProfileMenuProps = {
  onOpenSettings: () => void;
};

export function UserProfileMenu({ onOpenSettings }: UserProfileMenuProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { tier, is_trial, is_beta_user, isLoading } = useSubscription();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const firstName = user?.firstName || user?.username || "User";
  const lastName = user?.lastName || "";
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials =
    firstName.charAt(0).toUpperCase() +
    (lastName ? lastName.charAt(0).toUpperCase() : "");

  const getTierBadge = () => {
    if (isLoading) return null;

    if (is_beta_user) {
      return (
        <span className="flex items-center gap-1 text-xs text-purple-600">
          <Crown className="w-3 h-3" />
          Pro
        </span>
      );
    }

    if (tier === "pro" && is_trial) {
      return (
        <span className="flex items-center gap-1 text-xs text-blue-600">
          <Sparkles className="w-3 h-3" />
          Pro Trial
        </span>
      );
    }

    if (tier === "pro") {
      return (
        <span className="flex items-center gap-1 text-xs text-purple-600">
          <Crown className="w-3 h-3" />
          Pro
        </span>
      );
    }

    return <span className="text-xs text-gray-500">Free</span>;
  };

  const showUpgradeOption = (tier === "free" || is_trial) && !is_beta_user;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isMenuOpen]);

  const handleSettingsClick = () => {
    setIsMenuOpen(false);
    onOpenSettings();
  };

  const handleUpgradeClick = () => {
    setIsMenuOpen(false);
    alert("Upgrade functionality coming soon! Stay tuned.");
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="no-drag flex items-center gap-3 w-full px-3 py-3 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-medium text-white">{initials}</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <span className="text-sm text-gray-900 truncate block">
            {fullName}
          </span>
          {getTierBadge()}
        </div>
      </button>

      {isMenuOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {showUpgradeOption && (
            <button
              onClick={handleUpgradeClick}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Zap className="w-4 h-4" />
              <span>Upgrade to Pro</span>
            </button>
          )}
          <button
            onClick={handleSettingsClick}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
