import { BarChart3, Gauge, Home, PlusCircle, Settings, WalletCards } from "lucide-react";
import type { Page } from "../App";

type NavItem = {
  page: Page;
  label: string;
  icon: typeof Home;
};

const items: NavItem[] = [
  { page: "dashboard", label: "Home", icon: Home },
  { page: "budgets", label: "Budgets", icon: WalletCards },
  { page: "add", label: "Add", icon: PlusCircle },
  { page: "afford", label: "Afford", icon: Gauge },
  { page: "reports", label: "Report", icon: BarChart3 },
  { page: "settings", label: "Settings", icon: Settings },
];

type BottomNavProps = {
  page: Page;
  onNavigate: (page: Page) => void;
};

export function BottomNav({ page, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.page;
        return (
          <button
            className={`nav-button ${active ? "active" : ""}`}
            key={item.page}
            onClick={() => onNavigate(item.page)}
            title={item.label}
            type="button"
          >
            <Icon size={21} strokeWidth={active ? 2.6 : 2} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
