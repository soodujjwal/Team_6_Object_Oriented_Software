import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/layout.css";
import "./styles/components.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {import.meta.env.VITE_PLAID_SANDBOX && (
      <aside className="sandbox-banner" aria-label="Demo environment">
        <strong>Plaid Sandbox · Demo</strong>
        <span>Test banks and demo data · Separate from your original account</span>
      </aside>
    )}
    <App />
  </StrictMode>,
);
