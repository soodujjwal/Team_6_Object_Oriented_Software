import { useEffect, useState } from "react";
import { CircleHelp, FileClock, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { AUTH_TOKEN_KEY } from "./api/client";
import type { User } from "./api/auth";
import { AddTransactionPage } from "./pages/AddTransactionPage";
import { AffordabilityPage } from "./pages/AffordabilityPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SavingsGoalsPage } from "./pages/SavingsGoalsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { THEME_STORAGE_KEY, type Theme } from "./theme/theme";

export type Page =
  | "dashboard"
  | "budgets"
  | "add"
  | "goals"
  | "afford"
  | "reports"
  | "settings"
  | "accounts"
  | "transactions"
  | "recurring"
  | "help";

const USER_KEY = "pfm_user";
type AuthRoute = "/login" | "/register";

function getInitialTheme(): Theme {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  } catch {
    // Fall back to the browser preference when storage is unavailable.
  }
  const currentTheme = document.documentElement.dataset.theme;
  if (currentTheme === "light" || currentTheme === "dark") return currentTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [page, setPage] = useState<Page>("dashboard");
  const [authRoute, setAuthRoute] = useState<AuthRoute>(() =>
    window.location.pathname === "/register" ? "/register" : "/login",
  );
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? (JSON.parse(stored) as User) : null;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The active theme still applies for this session.
    }
  }, [theme]);

  useEffect(() => {
    if (!user && window.location.pathname !== "/login" && window.location.pathname !== "/register") {
      window.history.replaceState(null, "", "/login");
      setAuthRoute("/login");
    }

    function handlePopState() {
      setAuthRoute(window.location.pathname === "/register" ? "/register" : "/login");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user]);

  function navigateAuth(route: AuthRoute) {
    window.history.pushState(null, "", route);
    setAuthRoute(route);
  }

  function handleAuth(accessToken: string, nextUser: User) {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setPage("dashboard");
    window.history.replaceState(null, "", "/");
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setPage("dashboard");
  }

  if (!user) {
    return authRoute === "/register" ? (
      <RegisterPage onRegister={handleAuth} onShowLogin={() => navigateAuth("/login")} />
    ) : (
      <LoginPage onLogin={handleAuth} onShowRegister={() => navigateAuth("/register")} />
    );
  }

  return (
    <AppShell page={page} onLogout={handleLogout} onNavigate={setPage}>
      {page === "dashboard" && (
        <DashboardPage
          onNavigate={setPage}
          userName={user.name}
        />
      )}
      {page === "budgets" && <BudgetsPage />}
      {page === "add" && <AddTransactionPage onDone={() => setPage("dashboard")} />}
      {page === "goals" && <SavingsGoalsPage />}
      {page === "afford" && <AffordabilityPage />}
      {page === "reports" && <ReportsPage />}
      {page === "settings" && (
        <AccountSettingsPage onLogout={handleLogout} onThemeChange={setTheme} theme={theme} user={user} />
      )}
      {page === "accounts" && (
        <PlaceholderPage
          description="Account overview screens will show balances, account types, and account health here."
          icon={WalletCards}
          title="Accounts"
        />
      )}
      {page === "transactions" && (
        <PlaceholderPage
          description="A full searchable transaction history will live here. Use Add for now to create transactions."
          icon={ReceiptText}
          title="Transactions"
        />
      )}
      {page === "recurring" && (
        <PlaceholderPage
          description="Recurring income and payment schedules will be managed from this section."
          icon={FileClock}
          title="Recurring Transactions"
        />
      )}
      {page === "help" && (
        <PlaceholderPage
          description="Help content, FAQs, and support guidance will be added here."
          icon={CircleHelp}
          title="Help"
        />
      )}
    </AppShell>
  );
}
