import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  initFirebase,
  sendNotification,
  subscribeToMachinesForRoom,
  subscribeToRooms,
  writeMachine as writeMachineRealtime,
  writeMachines as writeMachinesRealtime,
  startMachineTransaction,
  finishMachineTransaction,
} from '../utilities/firebaseRealtime';

export type MachineState = 'available' | 'in-use' | 'finished';

export type Machine = {
  id: string;
  label: string;
  state: MachineState;
  ownerEmail?: string | null;
  ownerName?: string | null;
  startTime?: string | null;
  durationMin?: number | null;
  expectedFinishTime?: string | null;
  completedAt?: string | null;
  completionNotifiedAt?: number | null;
  lastReminderSent?: number | null;
  reminderCount?: number | null;
  reminderSubscribers?: string[];
};

type QueueContextValue = {
  machines: Machine[];
  startMachine: (id: string, userEmail: string, durationMin: number, ownerName?: string) => Promise<void>;
  finishMachine: (id: string) => Promise<void>;
  sendReminder: (id: string, fromEmail: string) => Promise<boolean>;
  getNotifications: (userEmail: string) => Array<{ id: string; message: string; ts: number }>;
  clearNotifications: (userEmail: string) => void;
  rooms: Array<{ id: string; name?: string }>;
  currentRoomId: string;
  setCurrentRoom: (id: string) => void;
};

export const QueueContext = createContext<QueueContextValue | null>(null);

const MACHINE_DEFINITIONS = [
  { id: 'm1', label: 'W1' },
  { id: 'm2', label: 'W2' },
  { id: 'm3', label: 'W3' },
  { id: 'm4', label: 'D1' },
  { id: 'm5', label: 'D2' },
  { id: 'm6', label: 'D3' },
] as const;

const createBlankMachine = (id: string, label: string): Machine => ({
  id,
  label,
  state: 'available',
  ownerEmail: null,
  ownerName: null,
  startTime: null,
  durationMin: null,
  expectedFinishTime: null,
  completedAt: null,
  completionNotifiedAt: null,
  lastReminderSent: null,
  reminderCount: 0,
  reminderSubscribers: [],
});

const createInitialMachineMap = () =>
  MACHINE_DEFINITIONS.reduce<Record<string, Machine>>((acc, { id, label }) => {
    acc[id] = createBlankMachine(id, label);
    return acc;
  }, {});

const INITIAL_MACHINE_MAP = createInitialMachineMap();
const INITIAL_MACHINES = Object.values(INITIAL_MACHINE_MAP);

const normalizeMachine = (id: string, value: Partial<Machine> & { ownerId?: string | null } = {}): Machine => {
  const base = INITIAL_MACHINE_MAP[id] ?? createBlankMachine(id, value.label ?? id);

  const ownerEmail = value.ownerEmail ?? value.ownerId ?? base.ownerEmail;
  const startTime = value.startTime ?? base.startTime;
  const durationMin = value.durationMin ?? base.durationMin;

  let expectedFinishTime = value.expectedFinishTime ?? base.expectedFinishTime;
  if (!expectedFinishTime && startTime && durationMin) {
    expectedFinishTime = new Date(new Date(startTime).getTime() + durationMin * 60_000).toISOString();
  }

  return {
    ...base,
    ...value,
    id,
    label: value.label ?? base.label,
    ownerEmail,
    ownerName: value.ownerName ?? ownerEmail,
    startTime,
    durationMin,
    expectedFinishTime,
    reminderSubscribers: Array.isArray(value.reminderSubscribers)
      ? value.reminderSubscribers.filter(Boolean)
      : base.reminderSubscribers,
    reminderCount: value.reminderCount ?? base.reminderCount,
    lastReminderSent: value.lastReminderSent ?? base.lastReminderSent,
  } satisfies Machine;
};

export const QueueProvider = ({ children }: { children: React.ReactNode }) => {
  const DEFAULT_ROOM = 'default';
  const [machines, setMachines] = useState<Machine[]>(INITIAL_MACHINES);
  const [notifications, setNotifications] = useState<Record<string, Array<{ id: string; message: string; ts: number }>>>({});
  const machinesRef = useRef<Machine[]>(INITIAL_MACHINES);
  const processingRef = useRef(false);
  const [rooms, setRooms] = useState<Array<{ id: string; name?: string }>>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string>(() => {
    try {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      return params.get('room') || DEFAULT_ROOM;
    } catch (e) {
      return DEFAULT_ROOM;
    }
  });

  const recordNotification = useCallback((entry: { id: string; recipientEmail: string; message: string; timestamp: number }) => {
    setNotifications((prev) => {
      const current = prev[entry.recipientEmail] || [];
      return {
        ...prev,
        [entry.recipientEmail]: [...current, { id: entry.id, message: entry.message, ts: entry.timestamp }],
      };
    });
  }, []);

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);



  // Subscribe to rooms on mount
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    const setup = async () => {
      try {
        await initFirebase();
        if (!active) return;

        unsubscribe = subscribeToRooms((data) => {
          if (!data) {
            setRooms([]);
            return;
          }
          const list = Object.entries<any>(data).map(([id, v]) => ({ id, name: v?.name }));
          setRooms(list);
          // if currentRoomId is default and there is a room named default, keep it; otherwise pick first
          if (!list.find((r) => r.id === currentRoomId) && list.length > 0) {
            setCurrentRoomId(list[0].id);
          }
        });
      } catch (err) {
        console.error('Failed to subscribe to rooms', err);
      }
    };
    setup();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Subscribe to machines for the selected room
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setup = async () => {
      try {
        await initFirebase();
        if (!active) return;

        unsubscribe = subscribeToMachinesForRoom(currentRoomId, (data) => {
          if (!data) {
            const seed = createInitialMachineMap();
            void writeMachinesRealtime(seed, currentRoomId);
            setMachines(Object.values(seed));
            machinesRef.current = Object.values(seed);
            return;
          }

          const normalized = Object.entries<any>(data).map(([machineId, value]) => normalizeMachine(machineId, value || {}));
          machinesRef.current = normalized;
          setMachines(normalized);
        });
      } catch (error) {
        console.error('Error setting up Firebase machines sync:', error);
        setMachines(INITIAL_MACHINES);
        machinesRef.current = INITIAL_MACHINES;
      }
    };

    setup();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [currentRoomId]);

  // Sync currentRoomId to URL
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('room', currentRoomId);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // ignore
    }
  }, [currentRoomId]);

  useEffect(() => {
    const tick = async () => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const snapshot = machinesRef.current;
        if (!snapshot || snapshot.length === 0) return;

        const updatedMachines: Machine[] = [];
        const writes: Promise<void>[] = [];
        const now = Date.now();

        for (const machine of snapshot) {
          if (machine.state !== 'in-use') {
            updatedMachines.push(machine);
            continue;
          }

          const finishTs = machine.expectedFinishTime
            ? Date.parse(machine.expectedFinishTime)
            : machine.startTime && machine.durationMin
                ? new Date(machine.startTime).getTime() + machine.durationMin * 60_000
                : null;

          if (!finishTs || now < finishTs) {
            updatedMachines.push(machine);
            continue;
          }

          const completedAt = machine.completedAt ?? new Date(now).toISOString();
          const expectedFinishTime = machine.expectedFinishTime ?? new Date(finishTs).toISOString();
          const updated: Machine = {
            ...machine,
            state: 'finished',
            completedAt,
            expectedFinishTime,
            completionNotifiedAt: machine.completionNotifiedAt ?? now,
          };

          if (!machine.completionNotifiedAt && machine.ownerEmail) {
            // const message = `Your laundry in ${machine.label} is done!`;
            // try {
            //   const id = await sendNotification({
            //     recipientEmail: machine.ownerEmail,
            //     message,
            //     timestamp: now,
            //     machineId: machine.id,
            //     type: 'completion',
            //   });
            //   recordNotification({ id, recipientEmail: machine.ownerEmail, message, timestamp: now });
            //   updated.completionNotifiedAt = now;
            // } catch (notificationError) {
            //   console.error('Failed to send completion notification', notificationError);
            // }
          }

          updatedMachines.push(updated);
          writes.push(writeMachineRealtime(machine.id, updated, currentRoomId));
        }

        if (writes.length > 0) {
          machinesRef.current = updatedMachines;
          setMachines(updatedMachines);
          await Promise.all(writes);
        }
      } catch (error) {
        console.error('Failed to evaluate machine timers', error);
      } finally {
        processingRef.current = false;
      }
    };

    const isVitest = (() => {
      try {
        // Node/Vitest
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && (process.env as any).VITEST) return true;
      } catch (e) {}
      try {
        // Vitest in ESM env
        // @ts-ignore
        if ((import.meta as any).env && (import.meta as any).env.VITEST) return true;
      } catch (e) {}
      // jsdom global injected by Vitest
      try {
        // @ts-ignore
        if (typeof (globalThis as any).__vitest !== 'undefined') return true;
      } catch (e) {}
      return false;
    })();
    const TICK_MS = isVitest ? 50 : 1000;
    const interval = setInterval(() => {
      void tick();
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [recordNotification]);

  const startMachine = useCallback(
    async (id: string, userEmail: string, durationMin: number, ownerName?: string) => {
      const machine = machines.find((m) => m.id === id);
      if (!machine) return;

      const now = Date.now();
      const expectedFinishTime = new Date(now + durationMin * 60_000).toISOString();

      const updated: Machine = {
        ...machine,
        state: 'in-use',
        ownerEmail: userEmail,
        ownerName: ownerName || userEmail,
        startTime: new Date(now).toISOString(),
        durationMin,
        expectedFinishTime,
        completedAt: null,
        completionNotifiedAt: null,
        lastReminderSent: null,
        reminderCount: 0,
        reminderSubscribers: [],
      };

      // Use transaction to avoid double-claim races
      try {
  await startMachineTransaction(currentRoomId, id, updated as any);
      } catch (err) {
        console.error('Failed to start machine transaction', err);
      }
    },
    [machines],
  );

  const finishMachine = useCallback(
    async (id: string) => {
      const machine = machines.find((m) => m.id === id);
      if (!machine) return;

      const now = Date.now();
      const subscribers = Array.from(new Set(machine.reminderSubscribers || []))
        .filter((email) => email && email !== machine.ownerEmail);

      if (subscribers.length > 0) {
        await Promise.all(
          subscribers.map(async (email) => {
            const message = `${machine.label} is now available.`;
            // try {
            //   const notifId = await sendNotification({
            //     recipientEmail: email,
            //     senderEmail: machine.ownerEmail || undefined,
            //     message,
            //     timestamp: now,
            //     machineId: machine.id,
            //     type: 'pickup',
            //   });
            //   recordNotification({ id: notifId, recipientEmail: email, message, timestamp: now });
            // } catch (notificationError) {
            //   console.error('Failed to send pickup notification', notificationError);
            // }
          }),
        );
      }

      const reset: Machine = {
        ...machine,
        state: 'available',
        ownerEmail: null,
        ownerName: null,
        startTime: null,
        durationMin: null,
        expectedFinishTime: null,
        completedAt: null,
        completionNotifiedAt: null,
        lastReminderSent: null,
        reminderCount: 0,
        reminderSubscribers: [],
      };

      try {
  await finishMachineTransaction(currentRoomId, id, reset as any);
      } catch (err) {
        console.error('Failed to finish machine transaction', err);
      }
    },
    [machines, recordNotification],
  );

  const REMINDER_THROTTLE_MS = 60_000;

  const sendReminder = useCallback(
    async (id: string, fromEmail: string) => {
      const machine = machines.find((m) => m.id === id);
      if (!machine || !machine.ownerEmail) return false;
      if (machine.ownerEmail === fromEmail) return false;

      const now = Date.now();
      const finishTs = machine.expectedFinishTime ? Date.parse(machine.expectedFinishTime) : null;
      const timerExpired = finishTs !== null && now >= finishTs;
      const readyToRemind = machine.state === 'finished' || timerExpired;
      if (!readyToRemind) {
        return false;
      }

      if (machine.lastReminderSent && now - machine.lastReminderSent < REMINDER_THROTTLE_MS) {
        return false;
      }

      const subscribers = new Set(machine.reminderSubscribers || []);
      subscribers.add(fromEmail);

      const updated: Machine = {
        ...machine,
        lastReminderSent: now,
        reminderCount: (machine.reminderCount ?? 0) + 1,
        reminderSubscribers: Array.from(subscribers),
      };

      const message = `Someone is waiting for ${machine.label}. Please pick up your laundry.`;

      // try {
      //   const notifId = await sendNotification({
      //     recipientEmail: machine.ownerEmail,
      //     senderEmail: fromEmail,
      //     message,
      //     timestamp: now,
      //     machineId: machine.id,
      //     type: 'reminder',
      //   });
      //   recordNotification({ id: notifId, recipientEmail: machine.ownerEmail, message, timestamp: now });
      // } catch (notificationError) {
      //   console.error('Failed to send reminder notification', notificationError);
      // }

  await writeMachineRealtime(id, updated, currentRoomId);
      return true;
    },
    [machines, recordNotification],
  );

  const getNotifications = useCallback(
    (userEmail: string) => notifications[userEmail] || [],
    [notifications],
  );

  const clearNotifications = useCallback((userEmail: string) => {
    setNotifications((prev) => {
      if (!prev[userEmail]) return prev;
      const next = { ...prev };
      next[userEmail] = [];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      machines,
      startMachine,
      finishMachine,
      sendReminder,
      getNotifications,
      clearNotifications,
      rooms,
      currentRoomId,
      setCurrentRoom: setCurrentRoomId,
    }),
    [machines, startMachine, finishMachine, sendReminder, getNotifications, clearNotifications, rooms, currentRoomId],
  );

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
};
