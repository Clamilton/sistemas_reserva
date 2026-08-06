import { useState } from "react";
import { Bell } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatDateTime } from "../lib/time";

export function NotificationBell() {
  const notifications = useAppStore((s) => s.notifications);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative flex-none">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="btn btn-icon relative"
        style={{
          background: "var(--color-accent-2-600)",
          color: "var(--color-header-text)",
          border: "1px solid var(--color-accent-2-400)",
        }}
      >
        <Bell size={17} strokeWidth={2.5} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-[color:var(--color-header-text)]">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-50 mt-2 w-80 rounded-[16px] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] elev-lg"
            style={{ color: "var(--color-text)" }}
          >
            <div className="border-b border-[color:var(--color-divider)] px-4 py-3">
              <h4 className="font-heading text-sm">Notificações</h4>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-6 text-center text-sm opacity-50">Nenhuma notificação</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`block w-full border-b border-[color:var(--color-divider)] px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-[color:var(--color-accent-100)] ${
                    n.read ? "opacity-60" : "font-semibold"
                  }`}
                >
                  <p>{n.message}</p>
                  <p className="mt-0.5 text-[11px] font-normal opacity-50">
                    {formatDateTime(n.createdAt)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
