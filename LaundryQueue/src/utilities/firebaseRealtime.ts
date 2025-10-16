import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  connectDatabaseEmulator,
  onValue,
  set,
  push,
  off,
  get,
  child,
  runTransaction,
} from 'firebase/database';
import { useEffect, useState } from 'react';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth, type NextOrObserver, type User } from 'firebase/auth';

let db: ReturnType<typeof getDatabase> | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;

function ensureDb() {
  if (!db) throw new Error('Realtime DB not initialized - call initFirebase() first');
  return db;
}

export function initFirebase() {
  if (db) return { db, auth: authInstance ?? getAuth() };

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const app = initializeApp(firebaseConfig as any);
  db = getDatabase(app);
  const auth = getAuth(app);
  authInstance = auth;

  try {
    const dbUrl = firebaseConfig.databaseURL;
    console.log('[firebaseRealtime] initialized with databaseURL=', dbUrl);
    if (dbUrl && (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') || dbUrl.startsWith('http://127.') || dbUrl.startsWith('http://localhost'))) {
      try {
        const parsed = new URL(dbUrl);
        const host = parsed.hostname;
        const port = parsed.port ? Number(parsed.port) : 9000;
        console.log(`[firebaseRealtime] connecting to local emulator at ${host}:${port}`);
        connectDatabaseEmulator(db, host, port);
      } catch (err) {
        console.warn('[firebaseRealtime] failed to parse databaseURL for emulator connect', err);
      }
    }
  } catch (err) {
    console.warn('[firebaseRealtime] init logging failed', err);
  }
  return { db, auth };
}

export const signInWithGoogle = (auth: Auth) => {
  signInWithPopup(auth, new GoogleAuthProvider());
};

const firebaseSignOut = (auth: Auth) => signOut(auth);

export { firebaseSignOut as signOut };

export interface AuthState {
  user: User | null,
  isAuthenticated: boolean,
  isInitialLoading: boolean
}

export const addAuthStateListener = (fn: NextOrObserver<User>, auth: Auth) => (
  onAuthStateChanged(auth, fn)
);


export const useAuthState = (auth:Auth) => {
  // accept missing auth gracefully
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!!auth);
  const isAuthenticated = !!user;

  useEffect(() => {
    if (!auth) {
      setIsInitialLoading(false);
      return;
    }
    const unsub = addAuthStateListener((u) => {
      setUser(u);
      setIsInitialLoading(false);
    }, auth);
    return () => unsub();
  }, [auth]);

  return { user, isAuthenticated, isInitialLoading };
};


/**
 * Subscribe to all machines stored at `/machines` in Realtime DB.
 * The callback receives the raw value at `/machines` (object map) or null if missing.
 * Returns unsubscribe function.
 */
export function subscribeToMachines(cb: (data: Record<string, any> | null) => void) {
  const database = ensureDb();
  const machinesRef = ref(database, 'machines');
  const listener = (snap: any) => {
    cb(snap.exists() ? snap.val() : null);
  };
  onValue(machinesRef, listener);
  return () => off(machinesRef, 'value', listener);
}

/**
 * Subscribe to machines under a specific room: `/rooms/{roomId}/machines`.
 */
export function subscribeToMachinesForRoom(roomId: string, cb: (data: Record<string, any> | null) => void) {
  const database = ensureDb();
  const machinesRef = ref(database, `rooms/${roomId}/machines`);
  const listener = (snap: any) => cb(snap.exists() ? snap.val() : null);
  onValue(machinesRef, listener);
  return () => off(machinesRef, 'value', listener);
}

/**
 * Subscribe to rooms (top-level `/rooms`). Callback receives object map or null.
 */
export function subscribeToRooms(cb: (data: Record<string, any> | null) => void) {
  const database = ensureDb();
  const roomsRef = ref(database, 'rooms');
  const listener = (snap: any) => cb(snap.exists() ? snap.val() : null);
  onValue(roomsRef, listener);
  return () => off(roomsRef, 'value', listener);
}

/**
 * Write a single machine. If roomId is provided, writes under `/rooms/{roomId}/machines/{id}`
 * otherwise writes under `/machines/{id}`.
 */
export async function writeMachine(id: string, data: Record<string, any>, roomId?: string) {
  const database = ensureDb();
  const path = roomId ? `rooms/${roomId}/machines/${id}` : `machines/${id}`;
  // Use set to replace the machine object. Consumers may call with the full object.
  try {
    await set(ref(database, path), data);
  } catch (err) {
    console.error('[firebaseRealtime] writeMachine failed', { path, err, data });
    throw err;
  }
}

/**
 * Write many machines at once. If roomId provided, sets `/rooms/{roomId}/machines`,
 * otherwise sets `/machines`.
 */
export async function writeMachines(map: Record<string, any>, roomId?: string) {
  const database = ensureDb();
  const path = roomId ? `rooms/${roomId}/machines` : `machines`;
  try {
    await set(ref(database, path), map);
  } catch (err) {
    console.error('[firebaseRealtime] writeMachines failed', { path, err });
    throw err;
  }
}

/**
 * Helper: fetch machines for a room (returns map or null)
 */
export async function fetchMachinesForRoom(roomId: string) {
  const database = ensureDb();
  const snap = await get(child(ref(database), `rooms/${roomId}/machines`));
  return snap.exists() ? snap.val() : null;
}

/**
 * Atomically start a machine within a room. Returns true if the transaction succeeded
 * and the machine was updated to in-use; false if it was already in-use.
 */
export async function startMachineTransaction(roomId: string, machineId: string, updatedFields: Record<string, any>) {
  const database = ensureDb();
  const machineRef = ref(database, `rooms/${roomId}/machines/${machineId}`);
  try {
    const result = await runTransaction(machineRef, (current) => {
      if (current === null) {
        // if missing, allow creation
        return { ...updatedFields };
      }
      if (current.state === 'in-use') {
        // already in use, abort
        return undefined;
      }
      return { ...current, ...updatedFields };
    });
    return !!result.committed;
  } catch (err) {
    console.error('[firebaseRealtime] startMachineTransaction failed', { roomId, machineId, err });
    return false;
  }
}

/**
 * Atomically release a machine within a room (set to available). Returns true if committed.
 */
export async function finishMachineTransaction(roomId: string, machineId: string, resetFields: Record<string, any>) {
  const database = ensureDb();
  const machineRef = ref(database, `rooms/${roomId}/machines/${machineId}`);
  try {
    const result = await runTransaction(machineRef, (current) => {
      if (current === null) {
        // nothing to do
        return undefined;
      }
      return { ...current, ...resetFields };
    });
    return !!result.committed;
  } catch (err) {
    console.error('[firebaseRealtime] finishMachineTransaction failed', { roomId, machineId, err });
    return false;
  }
}

// Helper to normalize emails into valid path segments
function encodeEmail(email: string) {
  return encodeURIComponent(email).replace(/\./g, '%2E');
}

export type NotificationRecord = {
  id: string;
  recipientEmail: string;
  senderEmail: string | null;
  message: string;
  ts: number;
  machineId: string | null;
  type: string | null;
  createdAt?: number;
};

/**
 * Minimal sendNotification implementation for now: stores a notification under
 * `/notifications/{encodedEmail}/{notifId}` and returns the generated id.
 * This is intentionally simple while notifications are being iterated separately.
 */
export async function sendNotification(payload: {
  recipientEmail: string;
  senderEmail?: string | null;
  message: string;
  timestamp: number;
  machineId?: string | null;
  type?: string | null;
}) {


  const database = db; // allow null case for tests
  // deterministic fallback id when DB isn't initialized
  if (!database) {
    return `mock-${payload.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const emailKey = encodeEmail(payload.recipientEmail);
  // push() generates a new child reference and key
  const pushRef = push(ref(database, `notifications/${emailKey}`));
  const id = pushRef.key as string;
  const record: NotificationRecord = {
    id,
    recipientEmail: payload.recipientEmail,
    senderEmail: payload.senderEmail || null,
    message: payload.message,
    ts: payload.timestamp,
    machineId: payload.machineId || null,
    type: payload.type || null,
    createdAt: Date.now(),
  };
  // write the record
  await set(pushRef, record);
  return id;
  
}

export function subscribeToNotificationsForEmail(email: string, cb: (records: NotificationRecord[]) => void) {
  const database = ensureDb();
  const emailKey = encodeEmail(email);
  const notifRef = ref(database, `notifications/${emailKey}`);
  const listener = (snap: any) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, NotificationRecord>;
    const list = Object.values(val).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    cb(list);
  };
  onValue(notifRef, listener);
  return () => off(notifRef, 'value', listener);
}

export async function clearNotificationsForEmail(email: string, ids?: string[]) {
  const database = ensureDb();
  const emailKey = encodeEmail(email);
  if (!ids || ids.length === 0) {
    await set(ref(database, `notifications/${emailKey}`), null);
    return;
  }
  await Promise.all(
    ids.map((id) => set(ref(database, `notifications/${emailKey}/${id}`), null)),
  );
}

export async function clearNotificationsForMachine(email: string, machineId: string) {
  const database = ensureDb();
  const emailKey = encodeEmail(email);
  const snap = await get(ref(database, `notifications/${emailKey}`));
  if (!snap.exists()) return;
  const data = snap.val() as Record<string, NotificationRecord>;
  const ids = Object.values(data)
    .filter((n) => n.machineId === machineId)
    .map((n) => n.id);
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => set(ref(database, `notifications/${emailKey}/${id}`), null)));
}


export default {
  subscribeToMachines,
  initFirebase,
  subscribeToRooms,
  writeMachine,
  writeMachines,
  fetchMachinesForRoom,
  sendNotification,
  subscribeToNotificationsForEmail,
  clearNotificationsForEmail,
  clearNotificationsForMachine,
};
