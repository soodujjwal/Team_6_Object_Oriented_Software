import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, isTokenCurrent, readStoredSession, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "./api/client";
import type { User } from "./api/auth";
import { AddTransactionPage } from "./pages/AddTransactionPage";
import { AffordabilityPage } from "./pages/AffordabilityPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { LandingPage } from "./pages/LandingPage";
import { readRoute, resolveRoute, type AppRoute } from "./domain/navigation";
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
import { isNativeApp } from "./domain/mobile";
import { ACCOUNT_SYNC_EVENT, clearAccountStorage, hasLegacyBrowserSettings, hasPendingAccountChanges, importLegacyBrowserSettings, loadAccountStorage, retryAccountSync } from "./api/accountStorage";

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
  const [route, setRoute] = useState<AppRoute>(() => isNativeApp() && readRoute(window.location.pathname) === "/" ? "/login" : readRoute(window.location.pathname));
  const [initialSession] = useState(readStoredSession);
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [sessionNotice, setSessionNotice] = useState(initialSession.expired ? SESSION_EXPIRED_MESSAGE : "");
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncError, setSyncError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadedUserId(null);
    setLoadError(false);
    setSyncError(false);
    if (!user) { clearAccountStorage(); return; }
    void loadAccountStorage(user).then((loaded) => {
      if (!active || !loaded) return;
      setOnboardingComplete(hasCompletedOnboarding(user));
      setLoadedUserId(user.id);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; clearAccountStorage(); };
  }, [user?.id, user?.email, loadAttempt]);

  useEffect(() => {
    const handleSync = (event: Event) => setSyncError(Boolean((event as CustomEvent<boolean>).detail));
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPendingAccountChanges()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener(ACCOUNT_SYNC_EVENT, handleSync);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener(ACCOUNT_SYNC_EVENT, handleSync); window.removeEventListener("beforeunload", beforeUnload); };
  }, []);

  useEffect(() => {
    function onExpired() {
      setUser(null);
      setOnboardingComplete(false);
      setPage("dashboard");
      setSessionNotice(SESSION_EXPIRED_MESSAGE);
      setRoute("/login");
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
    function handlePopState() {
      setRoute(readRoute(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const destination = resolveRoute(route, Boolean(user), isNativeApp());
    if (window.location.pathname !== destination) window.history.replaceState(null, "", destination);
    if (destination !== route) setRoute(destination);
    document.title = destination === "/" ? "Finance Builder | Your money, all connected"
      : destination === "/login" ? "Log in | Finance Builder"
      : destination === "/register" ? "Create an account | Finance Builder" : "Finance Builder";
  }, [route, user]);

  function navigateAuth(route: AppRoute) {
    if (isNativeApp() && route === "/") route = user ? "/app" : "/login";
    window.history.pushState(null, "", route);
    setRoute(route);
    window.scrollTo(0, 0);
  }

  function handleAuth(accessToken: string, nextUser: User) {
    setSessionNotice("");
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setOnboardingComplete(false);
    setLoadedUserId(null);
    setPage("dashboard");
    window.history.replaceState(null, "", "/app");
    setRoute("/app");
  }

  function handleLogout() {
    if (hasPendingAccountChanges() && isTokenCurrent(localStorage.getItem(AUTH_TOKEN_KEY))) {
      setSyncError(true);
      void retryAccountSync();
      return;
    }
    setSessionNotice("");
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setOnboardingComplete(false);
    setPage("dashboard");
    const destination = isNativeApp() ? "/login" : "/";
    window.history.replaceState(null, "", destination);
    setRoute(destination);
  }

  function handleUserUpdate(nextUser: User, accessToken?: string) {
    if (accessToken) localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }

  if (route === "/" && !isNativeApp()) return <LandingPage signedIn={Boolean(user)} />;

  if (!user) {
    return route === "/register" ? (
      <RegisterPage onRegister={handleAuth} onShowHome={isNativeApp() ? undefined : () => navigateAuth("/")} onShowLogin={() => navigateAuth("/login")} />
    ) : (
      <LoginPage notice={sessionNotice} onLogin={handleAuth} onShowHome={isNativeApp() ? undefined : () => navigateAuth("/")} onShowRegister={() => navigateAuth("/register")} />
    );
  }

  if (loadedUserId !== user.id) return <main className="auth-page"><div role="status">
    {loadError ? <>Could not load your saved account data. <button onClick={() => setLoadAttempt((n) => n + 1)}>Retry</button> <button onClick={handleLogout}>Sign out</button></> : "Loading your saved account data…"}
  </div></main>;

  const syncNotice = syncError && <div className="notice" role="alert">Your latest setup or preferences could not be saved. Keep this page open and <button onClick={() => void retryAccountSync()}>retry saving</button>.</div>;
  const legacyNotice = hasLegacyBrowserSettings() && <div className="notice">
    This browser has older budget preferences, import history, or goal markers. If they belong to you, you can save them to this account.
    <button disabled={importing} onClick={async () => {
      setImporting(true); setImportError(false);
      try { await importLegacyBrowserSettings(); setLoadAttempt((n) => n + 1); }
      catch { setImportError(true); }
      finally { setImporting(false); }
    }}>{importing ? "Importing…" : "Import my browser settings"}</button>
    {importError && <span role="alert">Import failed. Your old browser settings have been kept; please retry.</span>}
  </div>;

  if (!onboardingComplete) {
    return (
      <>{syncNotice}{legacyNotice}
      <OnboardingPage
        onComplete={(destination = "dashboard") => {
          markOnboardingComplete(user);
          setOnboardingComplete(true);
          setPage(destination);
        }}
        user={user}
      />
      </>
    );
  }

  return (
    <AppShell page={page} onLogout={handleLogout} onNavigate={setPage}>
      {syncNotice}
      {legacyNotice}
      {page === "dashboard" && (
        <DashboardPage
          onNavigate={setPage}
          userName={user.name}
        />
      )}
      {page === "budgets" && <BudgetsPage />}
      {page === "add" && <AddTransactionPage onDone={() => setPage("transactions")} />}
      {page === "goals" && <SavingsGoalsPage />}
      {page === "afford" && <AffordabilityPage />}
      {page === "reports" && <ReportsPage />}
      {page === "settings" && (
        <AccountSettingsPage onLogout={handleLogout} onThemeChange={setTheme} onUserUpdate={handleUserUpdate} theme={theme} user={user} />
      )}
      {page === "accounts" && <AccountsPage onAddAccount={() => setPage("settings")} />}
      {page === "transactions" && <TransactionsPage onAddTransaction={() => setPage("add")} onManageBills={() => setPage("recurring")} />}
      {page === "recurring" && <RecurringTransactionsPage />}
      {page === "help" && <HelpPage onNavigate={setPage} />}
      {page === "split" && <SplitBillPage userName={user.name} />}
    </AppShell>
  );
}
