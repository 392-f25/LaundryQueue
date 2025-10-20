import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { QueueContext } from "../context/QueueContext";
import {
  initFirebase,
  signInWithGoogle,
  signOut,
  useAuthState,
} from "../utilities/firebaseRealtime";
import { useUserNotifications } from "../hooks/useUserNotifications";
import { NotificationBanner } from "./NotificationBanner";

export const Navbar = () => {
  const firebase = initFirebase();
  const auth =
    "auth" in (firebase ?? {}) ? (firebase as { auth: any }).auth : undefined;
  const authState = useAuthState(auth);
  const user = authState.user;

  const queue = useContext(QueueContext);
  const [open, setOpen] = useState(false);
  const fallbackEmail =
    typeof window !== "undefined" ? localStorage.getItem("userEmail") : null;
  const currentUserEmail = user?.email || fallbackEmail;
  const { notifications, clearAll: clearAllNotifications } =
    useUserNotifications(currentUserEmail);
  const completionNotifications = useMemo(
    () => notifications.filter((n) => n.type === "completion"),
    [notifications]
  );

  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setAcknowledgedIds((prev) => {
      const next = new Set<string>();
      notifications.forEach((n) => {
        if (prev.has(n.id)) next.add(n.id);
      });
      return next;
    });
  }, [notifications]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        email?: string;
        machineId?: string;
      }>;
      const detail = custom.detail;
      if (!detail || !detail.machineId) return;
      if (detail.email && detail.email !== currentUserEmail) return;
      setAcknowledgedIds((prev) => {
        const next = new Set(prev);
        completionNotifications.forEach((n) => {
          if (n.machineId === detail.machineId) {
            next.add(n.id);
          }
        });
        return next;
      });
    };

    window.addEventListener(
      "washerwatch:ack-machine",
      handler as EventListener
    );
    return () => {
      window.removeEventListener(
        "washerwatch:ack-machine",
        handler as EventListener
      );
    };
  }, [completionNotifications, currentUserEmail]);

  const onRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (queue && queue.setCurrentRoom) queue.setCurrentRoom(v);
  };

  const onClear = async () => {
    if (!currentUserEmail) return;
    queue?.clearNotifications(currentUserEmail);
    await clearAllNotifications();
    setAcknowledgedIds(new Set());
    setOpen(false);
  };

  const badgeCount = notifications.filter(
    (n) => !acknowledgedIds.has(n.id)
  ).length;
  const activeCompletion = completionNotifications.find(
    (n) => !acknowledgedIds.has(n.id)
  );

  const dismissBanner = () => {
    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      completionNotifications.forEach((n) => next.add(n.id));
      return next;
    });
  };

  const bannerMessage = activeCompletion
    ? activeCompletion.message ||
      `Laundry finished in ${activeCompletion.machineId ?? "a machine"}`
    : null;

  const handleBellClick = () => {
    setOpen((s) => {
      const next = !s;
      if (!s) {
        dismissBanner();
      }
      return next;
    });
  };

  return (
    <header className="bg-white shadow">
      <div className="max-w-5xl mx-auto p-4 flex items-center justify-between">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="WasherWatch logo"
            className="h-8 w-auto"
            style={{ height: 36 }}
            onError={(e) => {
              // hide broken image and leave the alt text visible
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <div>
            <div className="text-sm text-slate-600"></div>
            <div className="text-xs text-slate-500 mt-1 break-all">
              {currentUserEmail && user? (
                `Email: ${currentUserEmail}`
              ) : (
                <span className="text-amber-600">
                  ⚠️ Email not set - notifications disabled
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
              overflow: "visible",
            }}
          >
            <div style={{ width: 280 }}>
              {bannerMessage && (
                <NotificationBanner
                  message={bannerMessage}
                  onDismiss={dismissBanner}
                />
              )}
            </div>
            <button
              aria-label="Notifications"
              onClick={handleBellClick}
              className="text-sm px-2 py-1"
            >
              🔔 {badgeCount > 0 ? `(${badgeCount})` : ""}
            </button>
            {open && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "2.25rem",
                  background: "white",
                  border: "1px solid #eee",
                  padding: "0.75rem",
                  width: 320,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Notifications</div>
                  <button onClick={onClear} style={{ fontSize: 12 }}>
                    Clear
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {notifications.length === 0 && (
                    <div style={{ fontSize: 13, color: "#666" }}>
                      No notifications
                    </div>
                  )}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: "0.5rem 0",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{ fontSize: 14 }}>{n.message}</div>
                      <div style={{ fontSize: 12, color: "#999" }}>
                        {new Date(n.ts).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              aria-label="Select room"
              onChange={onRoomChange}
              value={queue?.currentRoomId || ""}
              className="text-sm px-2 py-1"
            >
              {queue?.rooms && queue.rooms.length > 0 ? (
                queue.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name ?? r.id}
                  </option>
                ))
              ) : (
                <option value="default">default</option>
              )}
            </select>
          </div>
          <div style={{ flex: 1 }} className="flex justify-end">
            {user ? (
              <button
                className="px-3 py-1 border rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => signOut(auth)}
              >
                Sign Out
              </button>
            ) : (
              <button
                className="px-3 py-1 border rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => signInWithGoogle(auth)}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
