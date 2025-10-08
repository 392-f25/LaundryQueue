import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initFirebase, sendNotification, subscribeToMachines, writeMachine, writeMachines } from '../utilities/firebasePlaceholder';

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

// Toggle this flag to enable the user test scenario seed. When true,
// Washing Machine 1 (m1) will start with a job that ends 30 seconds after launch,
// and Washing Machine 3 (m3) will start with a job that ends 60 minutes after launch.
const ENABLE_USER_TEST_SCENARIO = true;

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
  const [machines, setMachines] = useState<Machine[]>(INITIAL_MACHINES);
  const [notifications, setNotifications] = useState<Record<string, Array<{ id: string; message: string; ts: number }>>>({});
  const machinesRef = useRef<Machine[]>(INITIAL_MACHINES);
  const processingRef = useRef(false);
  const pickupTimeoutsRef = useRef<Record<string, number>>({});

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

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setup = async () => {
      try {
        await initFirebase();
        if (!active) return;

        unsubscribe = subscribeToMachines((data) => {
          if (!data) {
              const seed = createInitialMachineMap();

              if (ENABLE_USER_TEST_SCENARIO) {
                const now = Date.now();

                // m1: running job that ends 30 seconds after launch
                const m1: Machine = {
                  ...seed['m1'],
                  state: 'in-use',
                  ownerEmail: 'test.user1@example.com',
                  ownerName: 'Test User 1',
                  startTime: new Date(now).toISOString(),
                  durationMin: 0.5 / 60, // 0.5 minutes = 30 seconds
                  expectedFinishTime: new Date(now + 10_000).toISOString(),
                };

                // m3: running job that ends 60 minutes after launch
                const m3: Machine = {
                  ...seed['m3'],
                  state: 'in-use',
                  ownerEmail: 'test.user3@example.com',
                  ownerName: 'Test User 3',
                  startTime: new Date(now).toISOString(),
                  durationMin: 60,
                  expectedFinishTime: new Date(now + 60 * 60_000).toISOString(),
                };

                seed['m1'] = m1;
                seed['m3'] = m3;
              }

              void writeMachines(seed);
              setMachines(Object.values(seed));
              machinesRef.current = Object.values(seed);
              return;
          }

          const normalized = Object.entries<any>(data).map(([machineId, value]) => normalizeMachine(machineId, value || {}));
          machinesRef.current = normalized;
          setMachines(normalized);
        });
      } catch (error) {
        console.error('Error setting up Firebase sync:', error);
        setMachines(INITIAL_MACHINES);
        machinesRef.current = INITIAL_MACHINES;
      }
    };

    setup();

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

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
            const message = `Your laundry in ${machine.label} is done!`;
            try {
              const id = await sendNotification({
                recipientEmail: machine.ownerEmail,
                message,
                timestamp: now,
                machineId: machine.id,
                type: 'completion',
              });
              recordNotification({ id, recipientEmail: machine.ownerEmail, message, timestamp: now });
              updated.completionNotifiedAt = now;
            } catch (notificationError) {
              console.error('Failed to send completion notification', notificationError);
            }
          }

          updatedMachines.push(updated);
          writes.push(writeMachine(machine.id, updated));
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

    const interval = setInterval(() => {
      void tick();
    }, 1000);

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

      await writeMachine(id, updated);
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
            try {
              const notifId = await sendNotification({
                recipientEmail: email,
                senderEmail: machine.ownerEmail || undefined,
                message,
                timestamp: now,
                machineId: machine.id,
                type: 'pickup',
              });
              recordNotification({ id: notifId, recipientEmail: email, message, timestamp: now });
            } catch (notificationError) {
              console.error('Failed to send pickup notification', notificationError);
            }
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

      await writeMachine(id, reset);
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

      try {
        const notifId = await sendNotification({
          recipientEmail: machine.ownerEmail,
          senderEmail: fromEmail,
          message,
          timestamp: now,
          machineId: machine.id,
          type: 'reminder',
        });
        recordNotification({ id: notifId, recipientEmail: machine.ownerEmail, message, timestamp: now });
      } catch (notificationError) {
        console.error('Failed to send reminder notification', notificationError);
      }

      await writeMachine(id, updated);

      // Schedule an automatic pickup by the owner ~15 seconds after a successful reminder.
      // If a previous timeout exists for this machine, clear it first.
      try {
        if (pickupTimeoutsRef.current[id]) {
          window.clearTimeout(pickupTimeoutsRef.current[id]);
        }
      } catch {}

      // use window.setTimeout which returns a number in browsers
      const handle = window.setTimeout(() => {
        // Fire-and-forget finish; this will notify subscribers and reset the machine
        void finishMachine(id);
        try {
          delete pickupTimeoutsRef.current[id];
        } catch {}
      }, 15_000);
      // store numeric handle
      // @ts-ignore - numeric timeout id
      pickupTimeoutsRef.current[id] = handle as unknown as number;

      return true;
    },
    [machines, recordNotification, finishMachine],
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
    () => ({ machines, startMachine, finishMachine, sendReminder, getNotifications, clearNotifications }),
    [machines, startMachine, finishMachine, sendReminder, getNotifications, clearNotifications],
  );

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
};
