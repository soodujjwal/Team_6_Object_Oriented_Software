import { createContext, useContext } from "react";

type AppChromeContextValue = {
  hasUnreadNotifications: boolean;
  openDrawer: () => void;
  toggleNotifications: () => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export const AppChromeProvider = AppChromeContext.Provider;

export function useAppChrome() {
  return useContext(AppChromeContext);
}

