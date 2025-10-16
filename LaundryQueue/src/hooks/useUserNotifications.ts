import { useEffect, useMemo, useState } from 'react';
import type { NotificationRecord } from '../utilities/firebaseRealtime';
import {
  subscribeToNotificationsForEmail,
  clearNotificationsForEmail,
  clearNotificationsForMachine,
} from '../utilities/firebaseRealtime';

export const useUserNotifications = (email: string | null | undefined) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    if (!email) {
      setNotifications([]);
      return;
    }
    const unsubscribe = subscribeToNotificationsForEmail(email, (records) => {
      setNotifications(records);
    });
    return () => unsubscribe();
  }, [email]);

  const completions = useMemo(
    () => notifications.filter((n) => n.type === 'completion'),
    [notifications],
  );

  const clearAll = async () => {
    if (!email) return;
    await clearNotificationsForEmail(email);
  };

  const clearByIds = async (ids: string[]) => {
    if (!email || ids.length === 0) return;
    await clearNotificationsForEmail(email, ids);
  };

  const clearByMachine = async (machineId: string) => {
    if (!email) return;
    await clearNotificationsForMachine(email, machineId);
  };

  return {
    notifications,
    completionNotifications: completions,
    clearAll,
    clearByIds,
    clearByMachine,
  };
};

export type { NotificationRecord };
