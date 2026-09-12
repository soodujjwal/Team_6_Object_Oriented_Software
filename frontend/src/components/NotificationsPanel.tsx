import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "./ui";

export type NotificationItem = {
  id: string;
  description: string;
  read: boolean;
  time: string;
  title: string;
  type: "budget" | "payment" | "goal" | "insight" | "sync";
};

const iconByType = {
  budget: AlertTriangle,
  payment: CalendarClock,
  goal: Target,
  insight: TrendingUp,
  sync: RefreshCw,
};

type NotificationsPanelProps = {
  isOpen: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
};

export function NotificationsPanel({
  isOpen,
  notifications,
  onClose,
  onMarkAllRead,
  onMarkRead,
}: NotificationsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="notifications-layer">
      <section
        aria-label="Notifications"
        className="notifications-panel"
        ref={panelRef}
        role="dialog"
      >
        <header className="notifications-header">
          <div>
            <h2>Notifications</h2>
            <p>{unreadCount} unread update{unreadCount === 1 ? "" : "s"}</p>
          </div>
          {notifications.length > 0 && (
            <button type="button" onClick={onMarkAllRead}>
              <CheckCheck size={16} />
              Mark all as read
            </button>
          )}
        </header>

        <div className="notifications-list">
          {notifications.length > 0 ? (
            notifications.map((notification) => {
              const Icon = iconByType[notification.type];
              return (
                <article className={`notification-card ${notification.read ? "read" : "unread"}`} key={notification.id}>
                  <div className="notification-icon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="notification-title-row">
                      <h3>{notification.title}</h3>
                      {!notification.read && <span aria-label="Unread" />}
                    </div>
                    <p>{notification.description}</p>
                    <time>{notification.time}</time>
                  </div>
                  {!notification.read && (
                    <button type="button" onClick={() => onMarkRead(notification.id)}>
                      Mark as read
                    </button>
                  )}
                </article>
              );
            })
          ) : (
            <div className="notifications-empty">
              <Bell size={28} />
              <h3>No notifications</h3>
              <p>Your financial alerts will appear here.</p>
            </div>
          )}
        </div>

        <Button className="notifications-close" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </section>
    </div>
  );
}

