import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Page } from "../App";
import { getAccounts } from "../api/accounts";
import { getPlaidStatus } from "../api/plaid";
import { reportingAmount, isReportable } from "../domain/financialTracking";
import { getBudgets, BUDGETS_UPDATED_EVENT } from "../api/budgets";
import { getTransactions, TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { getRecurringTransactions, RECURRING_TRANSACTIONS_UPDATED_EVENT } from "../api/recurringTransactions";
import { getBudgetAlertMessage, getEffectiveBudgets } from "../domain/budgeting";
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
    let previous: string | undefined;
    let pending = false;
    async function checkBankUpdates() {
      if (pending) return;
      pending = true;
      try {
        const status = await getPlaidStatus();
        const signature = JSON.stringify(status.connections.map((item) => [item.id, item.last_synced_at, item.status]));
        if (active && previous !== undefined && previous !== signature) window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
        if (active) previous = signature;
      } catch { /* The next poll retries transient connection failures. */ }
      finally { pending = false; }
    }
    void checkBankUpdates();
    const timer = window.setInterval(() => void checkBankUpdates(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshBudgetNotifications() {
      const today = new Date();
      try {
        const [budgets, recurring, accounts, transactions] = await Promise.all([
          getBudgets(),
          getRecurringTransactions(),
          getAccounts(),
          getTransactions(),
        ]);
        if (!active) return;
        const currentExpenses = transactions.filter((transaction) => {
          const [year, month] = transaction.transaction_date.slice(0, 10).split("-").map(Number);
          return transaction.transaction_type === "expense" && isReportable(transaction) && year === today.getFullYear() && month === today.getMonth() + 1;
        });
        const alerts = getEffectiveBudgets(budgets, today.getMonth() + 1, today.getFullYear())
          .map((budget) => {
            const spent = currentExpenses
              .filter((transaction) => transaction.category.toLocaleLowerCase() === budget.category.toLocaleLowerCase())
              .reduce((total, transaction) => total + reportingAmount(transaction), 0);
            const limit = Number(budget.monthly_limit);
            const percent = limit > 0 ? spent / limit * 100 : spent > 0 ? 100 : 0;
            return { budget, message: getBudgetAlertMessage(budget.category, percent) };
          })
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
      openSettings: () => onNavigate("settings"),
      toggleNotifications: () => setNotificationsOpen((open) => !open),
    }),
    [hasUnreadNotifications, onNavigate],
  );

  return (
    <AppChromeProvider value={chromeValue}>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <main className="app-background app-web" id="main-content" tabIndex={-1}>
        <section className="app-content">
          {children}
        </section>
        <BottomNav page={page} onNavigate={onNavigate} onOpenMenu={() => setDrawerOpen(true)} />
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
