export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export interface UserData {
  email: string;
  lastUsed: string;
}

export interface Notification {
  id: string;
  recipientEmail: string;
  senderEmail?: string;
  message: string;
  timestamp: number;
  machineId: string;
  type: 'completion' | 'reminder' | 'pickup';
}

type RefFn = (database: any, path: string) => any;
type SetFn = (reference: any, value: any) => Promise<void> | void;
type OnValueFn = (reference: any, callback: (snapshot: { val: () => any }) => void) => () => void;
type PushFn = (reference: any) => any;
type GetDatabaseFn = () => any;

let refImpl: RefFn;
let setImpl: SetFn;
let onValueImpl: OnValueFn;
let pushImpl: PushFn;
let getDatabaseImpl: GetDatabaseFn;
let database: any;
let isInitialized = false;

type Listener = (snapshot: { val: () => any }) => void;

const ensureInitialized = () => {
  if (!isInitialized) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
};

const splitPath = (path: string) => path.split('/').filter(Boolean);

const createSnapshot = (value: any) => ({
    val: () => (value === undefined ? null : value),
});

export const initFirebase = async () => {
  if (isInitialized) {
    return { database };
  }

  const root: Record<string, any> = {};
  const listeners: Record<string, Set<Listener>> = {};

  const getValue = (path: string) => {
    const parts = splitPath(path);
    let cursor: any = root;
    for (const segment of parts) {
      if (cursor == null) {
        return null;
      }
      cursor = cursor[segment];
    }
    return cursor ?? null;
  };

  const ensureContainer = (parts: string[]) => {
    let cursor: any = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const segment = parts[i];
      if (!cursor[segment] || typeof cursor[segment] !== 'object') {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }
    return cursor;
  };

  const notifyPath = (path: string) => {
    const parts = splitPath(path);
    for (let i = parts.length; i >= 0; i -= 1) {
      const subPath = parts.slice(0, i).join('/');
      const value = getValue(subPath);
      const set = listeners[subPath];
      if (set) {
        const snapshot = createSnapshot(value);
        set.forEach((cb) => cb(snapshot));
      }
    }
  };

  const setValue = (path: string, value: any) => {
    const parts = splitPath(path);
    if (parts.length === 0) {
      Object.keys(root).forEach((key) => delete root[key]);
      if (value && typeof value === 'object') {
        Object.assign(root, value);
      }
      notifyPath('');
      return;
    }

    const container = ensureContainer(parts);
    const last = parts[parts.length - 1];

    if (value === null) {
      delete container[last];
    } else {
      container[last] = value;
    }

    notifyPath(parts.join('/'));
  };

  const registerListener = (path: string, callback: Listener) => {
    if (!listeners[path]) {
      listeners[path] = new Set();
    }
    listeners[path].add(callback);
    callback(createSnapshot(getValue(path)));
    return () => {
      listeners[path]?.delete(callback);
    };
  };

  const makeRef = (path?: string) => ({ path: path ?? '' });

  const mockDb = {
    ref: makeRef,
  };

  getDatabaseImpl = () => mockDb;
  refImpl = (_db: unknown, path: string) => makeRef(path);
  setImpl = async (reference: { path: string }, value: any) => {
    setValue(reference.path, value);
  };
  onValueImpl = (reference: { path: string }, callback) => registerListener(reference.path, callback);
  pushImpl = (reference: { path: string }) => {
    const key = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const childPath = `${reference.path ? `${reference.path}/` : ''}${key}`;
    return { key, path: childPath };
  };

  database = mockDb;
  isInitialized = true;
  return { app: null, database: mockDb };
};

const getDatabaseInstance = () => {
  ensureInitialized();
  return getDatabaseImpl();
};

const makeRef = (path: string) => refImpl(getDatabaseInstance(), path);

export const subscribeToMachines = (callback: (data: Record<string, any> | null) => void) => {
  const machinesRef = makeRef('machines');
  return onValueImpl(machinesRef, (snapshot) => callback(snapshot.val()));
};

export const writeMachines = async (machines: Record<string, any>) => {
  const machinesRef = makeRef('machines');
  await setImpl(machinesRef, machines);
};

export const writeMachine = async (machineId: string, value: any) => {
  await setImpl(getMachineRef(machineId), value);
};

export const getMachineRef = (machineId: string) => {
  return makeRef(`machines/${machineId}`);
};

export const getUserRef = (email: string) => {
  return makeRef(`users/${btoa(email)}`);
};

export const getNotificationsRef = (email: string) => {
  return makeRef(`notifications/${btoa(email)}`);
};

export const saveUserEmail = async (email: string) => {
  const userData: UserData = {
    email,
    lastUsed: new Date().toISOString(),
  };
  await setImpl(getUserRef(email), userData);
  localStorage.setItem('userEmail', email);
};

export const getUserEmail = () => localStorage.getItem('userEmail');

export const sendNotification = async (notification: Omit<Notification, 'id'>) => {
  const notifRef = pushImpl(getNotificationsRef(notification.recipientEmail));
  const payload: Notification = {
    ...notification,
    id: notifRef.key,
  };
  await setImpl(notifRef, payload);

  const webhookUrl = import.meta.env.VITE_EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = import.meta.env.VITE_EMAIL_WEBHOOK_TOKEN;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          subjectHint:
            payload.type === 'completion'
              ? 'Laundry cycle complete'
              : payload.type === 'reminder'
                ? 'Laundry reminder'
                : 'Machine available',
        }),
      });
    } catch (error) {
      console.error('Failed to forward notification to email webhook', error);
    }
  }

  return payload.id;
};

export default {
  firebaseConfig,
  initFirebase,
  subscribeToMachines,
  writeMachines,
  writeMachine,
  getUserEmail,
  saveUserEmail,
  sendNotification,
  getMachineRef,
  getUserRef,
  getNotificationsRef,
};
