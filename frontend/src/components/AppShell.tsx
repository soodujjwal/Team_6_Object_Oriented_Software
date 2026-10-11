import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Page } from "../App";
import { getAccounts } from "../api/accounts";
import { getBudgets, BUDGETS_UPDATED_EVENT } from "../api/budgets";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { getRecurringTransactions, RECURRING_TRANSACTIONS_UPDATED_EVENT } from "../api/recurringTransactions";
import { getBudgetAlertMessage } from "../domain/budgeting";
import { buildBillNotifications } from "../domain/recurringBills";
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

export function AppShell({ children, onLogout, page, onNavigate }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let active = true;
    async function refreshBudgetNotifications() {
      const today = new Date();
      try {
        const [budgets, recurring, accounts] = await Promise.all([
          getBudgets(),
          getRecurringTransactions(),
          getAccounts(),
        ]);
        if (!active) return;
        const alerts = budgets
          .filter((budget) => budget.month === today.getMonth() + 1 && budget.year === today.getFullYear())
          .map((budget) => ({ budget, message: getBudgetAlertMessage(budget.category, Number(budget.usage_percent ?? 0)) }))
          .filter((entry): entry is { budget: (typeof budgets)[number]; message: string } => Boolean(entry.message));
        const billAlerts = buildBillNotifications(recurring, accounts, today);
        setNotifications((current) => {
          const previousAlerts = new Map(current.map((item) => [item.id, item]));
          return [
            ...alerts.map(({ budget, message }) => ({
              id: `budget-${budget.id}`,
              description: message,
              read: previousAlerts.get(`budget-${budget.id}`)?.read ?? false,
              time: "This month",
              title: "Budget Alert",
              type: "budget" as const,
            })),
            ...billAlerts.map((alert) => ({
              ...alert,
              read: previousAlerts.get(alert.id)?.read ?? false,
            })),
          ];
        });
      } catch {
        // Budget and bill notifications remain unavailable until the backend responds.
      }
    }
    void refreshBudgetNotifications();
    window.addEventListener(BUDGETS_UPDATED_EVENT, refreshBudgetNotifications);
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, refreshBudgetNotifications);
    window.addEventListener(RECURRING_TRANSACTIONS_UPDATED_EVENT, refreshBudgetNotifications);
    window.addEventListener("focus", refreshBudgetNotifications);
    return () => {
      active = false;
      window.removeEventListener(BUDGETS_UPDATED_EVENT, refreshBudgetNotifications);
      window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, refreshBudgetNotifications);
      window.removeEventListener(RECURRING_TRANSACTIONS_UPDATED_EVENT, refreshBudgetNotifications);
      window.removeEventListener("focus", refreshBudgetNotifications);
    };
  }, []);

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
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <main className="app-background app-web" id="main-content" tabIndex={-1}>
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
