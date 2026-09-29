import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, isTokenCurrent, readStoredSession, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "./api/client";
import type { User } from "./api/auth";
import { AddTransactionPage } from "./pages/AddTransactionPage";
import { AffordabilityPage } from "./pages/AffordabilityPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AccountSettingsPage } from "./pages/AccountSettingsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RecurringTransactionsPage } from "./pages/RecurringTransactionsPage";
import { SavingsGoalsPage } from "./pages/SavingsGoalsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { HelpPage } from "./pages/HelpPage";
import { SplitBillPage } from "./pages/SplitBillPage";
import { OnboardingPage, hasCompletedOnboarding, markOnboardingComplete } from "./pages/OnboardingPage";
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
  | "help"
  | "split";

const USER_KEY = AUTH_USER_KEY;
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
  const [initialSession] = useState(readStoredSession);
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [sessionNotice, setSessionNotice] = useState(initialSession.expired ? SESSION_EXPIRED_MESSAGE : "");
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    initialSession.user ? hasCompletedOnboarding(initialSession.user) : false,
  );

  useEffect(() => {
    function onExpired() {
      setUser(null);
      setOnboardingComplete(false);
      setPage("dashboard");
      setSessionNotice(SESSION_EXPIRED_MESSAGE);
      setAuthRoute("/login");
      window.history.replaceState(null, "", "/login");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    // Catch expiry detected by child effects before this listener was installed.
    if (user && !isTokenCurrent(localStorage.getItem(AUTH_TOKEN_KEY))) onExpired();
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [user]);

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
    setSessionNotice("");
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setOnboardingComplete(hasCompletedOnboarding(nextUser));
    setPage("dashboard");
    window.history.replaceState(null, "", "/");
  }

  function handleLogout() {
    setSessionNotice("");
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setOnboardingComplete(false);
    setPage("dashboard");
  }

  function handleUserUpdate(nextUser: User, accessToken?: string) {
    if (accessToken) localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  if (!user) {
    return authRoute === "/register" ? (
      <RegisterPage onRegister={handleAuth} onShowLogin={() => navigateAuth("/login")} />
    ) : (
      <LoginPage notice={sessionNotice} onLogin={handleAuth} onShowRegister={() => navigateAuth("/register")} />
    );
  }

  if (!onboardingComplete) {
    return (
      <OnboardingPage
        onComplete={(destination = "dashboard") => {
          markOnboardingComplete(user);
          setOnboardingComplete(true);
          setPage(destination);
        }}
        user={user}
      />
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
        <AccountSettingsPage onLogout={handleLogout} onThemeChange={setTheme} onUserUpdate={handleUserUpdate} theme={theme} user={user} />
      )}
      {page === "accounts" && <AccountsPage onAddAccount={() => setPage("settings")} />}
      {page === "transactions" && <TransactionsPage />}
      {page === "recurring" && <RecurringTransactionsPage />}
      {page === "help" && <HelpPage onNavigate={setPage} />}
      {page === "split" && <SplitBillPage userName={user.name} />}
    </AppShell>
  );
}
