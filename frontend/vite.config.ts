import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiUrl = mode === "plaid-sandbox" ? "http://127.0.0.1:8001" : env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  if (mode === "mobile" && !/^https:\/\//.test(apiUrl)) throw new Error("Set VITE_API_BASE_URL to your public HTTPS backend before building the mobile app.");
  return ({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_PLAID_SANDBOX": JSON.stringify(mode === "plaid-sandbox"),
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiUrl),
  },
  build: { outDir: mode === "plaid-sandbox" ? "dist-sandbox" : mode === "mobile" ? "dist-mobile" : "dist" },
  server: {
    host: "127.0.0.1",
    port: mode === "plaid-sandbox" ? 5174 : 5173,
    strictPort: mode === "plaid-sandbox",
  },
});
});

