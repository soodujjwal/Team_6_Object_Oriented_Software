import { useMemo, useState, type ReactNode } from "react";
import type { Page } from "../App";
import { BottomNav } from "./BottomNav";
import { AppChromeProvider } from "./AppChromeContext";
import { NavigationDrawer } from "./NavigationDrawer";
import { NotificationsPanel, type NotificationItem } from "./NotificationsPanel";

type AppShellProps = {
  children: ReactNode;
  onLogout: () => void;
  page: Page;
  onNavigate: (page: Page) => void;
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "budget-food",
    description: "You've used 85% of your Food & Dining budget.",
    read: false,
    time: "Today",
    title: "Budget Alert",
    type: "budget",
  },
  {
    id: "upcoming-payment",
    description: "Your upcoming recurring payment of $15.49 is due tomorrow.",
    read: false,
    time: "Tomorrow",
    title: "Upcoming Payment",
    type: "payment",
  },
  {
    id: "emergency-fund",
    description: "You're 75% toward your Emergency Fund goal.",
    read: false,
    time: "2 days ago",
    title: "Savings Goal",
    type: "goal",
  },
  {
    id: "spending-insight",
    description: "Your spending this month is higher than last month.",
    read: true,
    time: "This week",
    title: "Spending Insight",
    type: "insight",
  },
  {
    id: "account-sync",
    description: "Your financial account needs to be synced.",
    read: true,
    time: "Last week",
    title: "Account Sync",
    type: "sync",
  },
];

export function AppShell({ children, onLogout, page, onNavigate }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const hasUnreadNotifications = notifications.some((notification) => !notification.read);
  const chromeValue = useMemo(
    () => ({
      hasUnreadNotifications,
      openDrawer: () => setDrawerOpen(true),
      toggleNotifications: () => setNotificationsOpen((open) => !open),
    }),
    [hasUnreadNotifications],
  );

  return (
    <AppChromeProvider value={chromeValue}>
      <main className="app-background app-web">
        <section className="app-content">
          {children}
        </section>
        <BottomNav page={page} onNavigate={onNavigate} />
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onLogout={onLogout}
          onNavigate={onNavigate}
        />
        <NotificationsPanel
          isOpen={notificationsOpen}
          notifications={notifications}
          onClose={() => setNotificationsOpen(false)}
          onMarkAllRead={() =>
            setNotifications((items) => items.map((item) => ({ ...item, read: true })))
          }
          onMarkRead={(id) =>
            setNotifications((items) =>
              items.map((item) => (item.id === id ? { ...item, read: true } : item)),
            )
          }
        />
      </main>
    </AppChromeProvider>
  );
}
