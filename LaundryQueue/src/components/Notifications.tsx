// src/components/Notifications.tsx
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueueContext } from '../context/QueueContext';
import { AuthContext } from '../context/AuthContext';
import {
  initFirebase,
subscribeToNotificationsByUid,
 markNotificationSeenByUid,
} from '../utilities/firebaseRealtime';
//import { getUserEmail } from '../utilities/firebasePlaceholder';
import { getAuth } from 'firebase/auth';

type Note = { id: string; message: string; ts: number };
type NoteLite = { id: string; message: string };

type Props = {
  /** how long each square stays on screen (ms) */
  durationMs?: number;
  /** max number of squares shown at once (oldest drop off) */
  maxStack?: number;
};

/**
 * Shows small colored squares at the top-right that auto-dismiss after a few seconds.
 * Squares are keyed by notification id; duplicates are ignored.
 */
export function Notifications({ durationMs = 3500, maxStack = 5 }: Props) {
  const _queue = useContext(QueueContext);
  const _auth = useContext(AuthContext);

  // Keep the memo to avoid removing your original logic; prefix with _
  const _inbox: Note[] = useMemo(() => {
    if (!_auth?.currentUser || !_queue) return [];
    return _queue.getNotifications(_auth.currentUser.id) ?? [];
  }, [_auth?.currentUser, _queue]);

  // What we actually render (UI-local ephemeral state)
  const [visible, setVisible] = useState<NoteLite[]>([]);

  // Track which ids we’ve already displayed so we don’t re-queue duplicates
  const seenIds = useRef<Set<string>>(new Set());

  // Palette: stable color per id (hash -> pick)
  const palette = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308'];
  const colorFor = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  // local helper that replaces "enqueueSquare"
  const showSquare = (n: NoteLite) => {
    setVisible((prev) => {
      const next = [...prev, n];
      return next.slice(Math.max(0, next.length - maxStack));
    });
    // auto-remove after duration
    setTimeout(() => {
      setVisible((prev) => prev.filter((x) => x.id !== n.id));
    }, durationMs);
  };

  useEffect(() => {
    initFirebase();
    // const email = getUserEmail();
    // if (!email) return;
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;

   const unsub = subscribeToNotificationsByUid(uid, (note: any) => {
      if (!note || !note.id || !note.message) return;
      if (note.seen) return;                       // don’t duplicate if already consumed elsewhere
      if (seenIds.current.has(note.id)) return;    // don’t duplicate on this tab

      seenIds.current.add(note.id);
      showSquare({ id: note.id, message: note.message });

      // mark as seen so other sessions won’t re-show
      setTimeout(() => {
        // markNotificationSeen(email, note.id).catch(() => {});
        markNotificationSeenByUid(uid, note.id).catch(() => {});
      }, Math.max(0, durationMs - 200)); // mark right before we hide (or immediately if you prefer)
    });

    return () => unsub();
  }, [durationMs, maxStack]);

  if (visible.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {visible.map((n) => (
        <div
          key={n.id}
          className="toast-square"
          title={n.message}
          style={{ backgroundColor: colorFor(n.id) }}
          role="status"
          aria-label={n.message}
        />
      ))}
      {/* hidden, for screen readers */}
      <span className="sr-only">
        {visible.length} notification{visible.length > 1 ? 's' : ''}.
      </span>
    </div>
  );
}

export default Notifications;
