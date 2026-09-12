import { useEffect, useRef } from "react";
import {
  CircleHelp,
  CreditCard,
  FileClock,
  LogOut,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { Page } from "../App";

type DrawerItem =
  | { label: string; icon: typeof WalletCards; page: Page }
  | { label: string; icon: typeof WalletCards; action: "logout" };

const drawerItems: DrawerItem[] = [
  { label: "Accounts", icon: WalletCards, page: "accounts" },
  { label: "Transactions", icon: ReceiptText, page: "transactions" },
  { label: "Goals", icon: Target, page: "goals" },
  { label: "Reports", icon: TrendingUp, page: "reports" },
  { label: "Recurring Transactions", icon: FileClock, page: "recurring" },
  { label: "Settings", icon: Settings, page: "settings" },
  { label: "Help", icon: CircleHelp, page: "help" },
  { label: "Logout", icon: LogOut, action: "logout" },
];

type NavigationDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
};

export function NavigationDrawer({ isOpen, onClose, onLogout, onNavigate }: NavigationDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    drawerRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function handleItemClick(item: DrawerItem) {
    if ("action" in item) {
      onLogout();
    } else {
      onNavigate(item.page);
    }
    onClose();
  }

  return (
    <div className={`drawer-layer ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close menu" />
      <aside
        aria-label="Secondary navigation"
        aria-modal="true"
        className="navigation-drawer"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-heading">
          <div className="drawer-mark">
            <CreditCard size={24} />
          </div>
          <div>
            <strong>Personal Finance</strong>
            <span>Manage your money</span>
          </div>
        </div>

        <nav className="drawer-nav">
          {drawerItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => handleItemClick(item)}>
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

