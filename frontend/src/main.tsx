import { Component, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LoadingScreen } from "./components/LoadingScreen";
import { PageSkeleton } from "./components/PageSkeleton";
import { isNativeApp } from "./domain/mobile";
import "./theme/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/layout.css";
import "./styles/components.css";

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <LoadingScreen error onRetry={() => window.location.reload()} /> : this.props.children;
  }
}

function InitialSkeleton() {
  const path = window.location.pathname;
  if (isNativeApp() && path === "/") return <PageSkeleton page="login" />;
  if (path === "/login") return <PageSkeleton page="login" />;
  if (path === "/register") return <PageSkeleton page="register" />;
  if (path === "/download") return <PageSkeleton page="download" />;
  if (path === "/") return <PageSkeleton page="landing" />;
  return <LoadingScreen />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {import.meta.env.VITE_PLAID_SANDBOX && (
      <aside className="sandbox-banner" aria-label="Demo environment">
        <strong>Plaid Sandbox · Demo</strong>
        <span>Test banks and demo data · Separate from your original account</span>
      </aside>
    )}
    <PageBoundary><Suspense fallback={<InitialSkeleton />}><App /></Suspense></PageBoundary>
  </StrictMode>,
);
