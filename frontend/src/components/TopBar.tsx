import { Bell, Menu } from "lucide-react";
import { useAppChrome } from "./AppChromeContext";
import { IconButton } from "./ui";

type TopBarProps = {
  title: string;
  right?: "bell" | "none";
};

export function TopBar({ title, right = "bell" }: TopBarProps) {
  const chrome = useAppChrome();

  return (
    <header className="top-bar">
      <IconButton aria-label="Open menu" onClick={chrome?.openDrawer} title="Menu">
        <Menu size={22} />
      </IconButton>
      <h1>{title}</h1>
      {right === "bell" ? (
        <IconButton
          aria-label="Open notifications"
          className={chrome?.hasUnreadNotifications ? "has-unread" : ""}
          onClick={chrome?.toggleNotifications}
          title="Notifications"
        >
          <Bell size={21} />
        </IconButton>
      ) : (
        <span className="icon-spacer" />
      )}
    </header>
  );
}
