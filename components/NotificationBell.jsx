"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuth } from "firebase/auth";

// Add this component anywhere in your header/navbar, e.g.:
//   <NotificationBell />
export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const idToken = await user.getIdToken();

      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();

      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30s for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const idToken = await user.getIdToken();

      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ notificationId }),
      });

     
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };


  const clearAllNotifications = async () => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) return;

    const confirmed = window.confirm(
      "Are you sure you want to clear all notifications?"
    );

    if (!confirmed) return;

    const idToken = await user.getIdToken();

    const res = await fetch("/api/notifications", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const data = await res.json();

    if (data.success) {
      setNotifications([]);
      setUnreadCount(0);
    } else {
      console.error(
        "Failed to clear notifications:",
        data.error
      );
    }
  } catch (err) {
    console.error(
      "Failed to clear notifications:",
      err
    );
  }
};

  const handleOpen = async () => {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
  };

  return (
    <div className="relative z-[9999]">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-white/10 transition"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-gray-950 border border-gray-700 rounded-lg shadow-2xl z-[9999]" style={{ backgroundColor: "#0a0e14" }}>
         <div
  className="p-3 border-b border-gray-700 font-bold text-sm text-white bg-gray-900 flex items-center justify-between"
  style={{ backgroundColor: "#111827" }}
>
  <span>Notifications</span>

  {notifications.length > 0 && (
    <button
      onClick={clearAllNotifications}
      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
    >
      Clear All
    </button>
  )}
</div>

          {loading && (
            <div className="p-4 text-center text-gray-500 text-sm bg-gray-950" style={{ backgroundColor: "#0a0e14" }}>Loading...</div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm" style={{ backgroundColor: "#0a0e14" }}>
              No notifications yet
            </div>
          )}

          {!loading &&
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.isRead && markAsRead(n.id)}
                className={`p-3 border-b border-gray-800 cursor-pointer transition hover:bg-white/10`}
                style={{ backgroundColor: n.isRead ? "#0a0e14" : "#0c2a3a" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-white">
                    {n.title}
                  </span>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-gray-200 mt-1">{n.message}</p>
                <span className="text-[10px] text-gray-400 mt-1 block">
                  {new Date(n.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}