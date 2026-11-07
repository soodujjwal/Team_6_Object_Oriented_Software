import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { clearSession, getAccessToken, storeSession, isTokenCurrent, readStoredSession, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from "./api/client";
import type { User } from "./api/auth";
import { readRoute, resolveRoute, type AppRoute } from "./domain/navigation";
import { hasCompletedOnboarding, markOnboardingComplete } from "./domain/onboardingState";
import { LoadingScreen } from "./components/LoadingScreen";
import { PageSkeleton } from "./components/PageSkeleton";
import { THEME_STORAGE_KEY, type Theme } from "./theme/theme";
import { isNativeApp } from "./domain/mobile";
import { ACCOUNT_SYNC_EVENT, clearAccountStorage, hasLegacyBrowserSettings, hasPendingAccountChanges, importLegacyBrowserSettings, loadAccountStorage, retryAccountSync } from "./api/accountStorage";

const AddTransactionPage = lazy(() => import("./pages/AddTransactionPage").then((module) => ({ default: module.AddTransactionPage })));
const AffordabilityPage = lazy(() => import("./pages/AffordabilityPage").then((module) => ({ default: module.AffordabilityPage })));
const BudgetsPage = lazy(() => import("./pages/BudgetsPage").then((module) => ({ default: module.BudgetsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));
const DownloadPage = lazy(() => import("./pages/DownloadPage").then((module) => ({ default: module.DownloadPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage").then((module) => ({ default: module.AccountSettingsPage })));
const AccountsPage = lazy(() => import("./pages/AccountsPage").then((module) => ({ default: module.AccountsPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const RecurringTransactionsPage = lazy(() => import("./pages/RecurringTransactionsPage").then((module) => ({ default: module.RecurringTransactionsPage })));
const SavingsGoalsPage = lazy(() => import("./pages/SavingsGoalsPage").then((module) => ({ default: module.SavingsGoalsPage })));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage").then((module) => ({ default: module.TransactionsPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((module) => ({ default: module.HelpPage })));
const SplitBillPage = lazy(() => import("./pages/SplitBillPage").then((module) => ({ default: module.SplitBillPage })));

const OnboardingPage = lazy(() => import("./pages/OnboardingPage").then((module) => ({ default: module.OnboardingPage })));

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
    const controller = new AbortController();
    void loadAccountStorage(user, controller.signal).then((loaded) => {
      if (!active || !loaded) return;
      setOnboardingComplete(hasCompletedOnboarding(user));
      setLoadedUserId(user.id);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; controller.abort(); clearAccountStorage(); };
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
    function onExpired(event?: Event) {
      setUser(null);
      setOnboardingComplete(false);
      setPage("dashboard");
      const message = (event as CustomEvent<{ message?: string }> | undefined)?.detail?.message;
      setSessionNotice(typeof message === "string" ? message : SESSION_EXPIRED_MESSAGE);
      setRoute("/login");
      window.history.replaceState(null, "", "/login");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    // Catch expiry detected by child effects before this listener was installed.
    if (user && !isTokenCurrent(getAccessToken())) onExpired();
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
    function back(event: Event) {
      if (user && page !== "dashboard") { event.preventDefault(); setPage("dashboard"); }
      else if (!user && route === "/register") { event.preventDefault(); navigateAuth("/login"); }
    }
    window.addEventListener("pfm:android-back", back);
    return () => window.removeEventListener("pfm:android-back", back);
  }, [page, user, route]);

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
      : destination === "/register" ? "Create an account | Finance Builder"
      : destination === "/download" ? "Download for Android | Finance Builder" : "Finance Builder";
  }, [route, user]);

  function navigateAuth(route: AppRoute) {
    if (isNativeApp() && route === "/") route = user ? "/app" : "/login";
    window.history.pushState(null, "", route);
    setRoute(route);
    window.scrollTo(0, 0);
  }

  async function handleAuth(accessToken: string, nextUser: User) {
    await storeSession(accessToken, nextUser);
    setSessionNotice("");
    setUser(nextUser);
    setOnboardingComplete(false);
    setLoadedUserId(null);
    setPage("dashboard");
    window.history.replaceState(null, "", "/app");
    setRoute("/app");
  }

  function handleLogout() {
    if (hasPendingAccountChanges() && isTokenCurrent(getAccessToken())) {
      setSyncError(true);
      void retryAccountSync();
      return;
    }
    setSessionNotice("");
    clearSession();
    setUser(null);
    setOnboardingComplete(false);
    setPage("dashboard");
    const destination = isNativeApp() ? "/login" : "/";
    window.history.replaceState(null, "", destination);
    setRoute(destination);
  }

  async function handleUserUpdate(nextUser: User, accessToken?: string) {
    const token = accessToken ?? getAccessToken();
    if (token) await storeSession(token, nextUser);
    setUser(nextUser);
  }

  if (route === "/" && !isNativeApp()) return <LandingPage signedIn={Boolean(user)} />;
  if (route === "/download") return <Suspense fallback={<PageSkeleton page="download" />}><DownloadPage signedIn={Boolean(user)} /></Suspense>;

  if (!user) {
    return route === "/register" ? (
      <RegisterPage onRegister={handleAuth} onShowHome={isNativeApp() ? undefined : () => navigateAuth("/")} onShowLogin={() => navigateAuth("/login")} />
    ) : (
      <LoginPage notice={sessionNotice} onLogin={handleAuth} onShowHome={isNativeApp() ? undefined : () => navigateAuth("/")} onShowRegister={() => navigateAuth("/register")} />
    );
  }

  if (loadedUserId !== user.id) return <LoadingScreen page={page} key={loadAttempt} error={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} onSignOut={handleLogout} />;

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
      <Suspense fallback={<PageSkeleton page="onboarding" />}><OnboardingPage
        onComplete={(destination = "dashboard") => {
          markOnboardingComplete(user);
          setOnboardingComplete(true);
          setPage(destination);
        }}
        user={user}
      /></Suspense>
      </>
    );
  }

  return (
    <AppShell page={page} onLogout={handleLogout} onNavigate={setPage}>
      <Suspense fallback={<PageSkeleton page={page} />}>
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
      {page === "recurring" && <RecurringTransactionsPage onOpenAccounts={() => setPage("accounts")} />}
      {page === "help" && <HelpPage onNavigate={setPage} />}
      {page === "split" && <SplitBillPage userName={user.name} />}
      </Suspense>
    </AppShell>
  );
}
