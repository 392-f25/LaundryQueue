import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  runTransaction,
  Timestamp,
  getDocs,
  addDoc,
  setDoc,
} from 'firebase/firestore';

let db: ReturnType<typeof getFirestore> | null = null;

/**
 * Listen to all machines for a roomId (machines stored in top-level 'machines' collection)
 * returns unsubscribe function
 */
export function listenToMachines(roomId: string, cb: (machines: any[]) => void) {
  if (!db) throw new Error('Firebase not initialized');
  const q = query(collection(db, 'machines'), where('roomId', '==', roomId));
  return onSnapshot(q, (snap) => {
    const out = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb(out);
  });
}

/**
 * Reserve machine using a transaction to avoid double-reserve race
 * endsAt: JS Date or Timestamp
 */
export async function reserveMachine(machineId: string, userId: string, endsAt: Date | Timestamp) {
  if (!db) throw new Error('Firebase not initialized');
  const ref = doc(db, 'machines', machineId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('machine not found');
    const data: any = snap.data();
    if (data.inUse) throw new Error('machine already in use');
    tx.update(ref, {
      inUse: true,
      currentUserId: userId,
      endsAt: endsAt instanceof Timestamp ? endsAt : Timestamp.fromDate(endsAt),
    });
  });
}

/**
 * Release a machine (only currentUser should release — enforce via rules)
 */
export async function releaseMachine(machineId: string) {
  if (!db) throw new Error('Firebase not initialized');
  const ref = doc(db, 'machines', machineId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('machine not found');
    tx.update(ref, {
      inUse: false,
      currentUserId: null,
      endsAt: null,
    });
  });
}

/**
 * Write machine document (creates/merges)
 */
export async function writeMachine(id: string, data: Record<string, any>) {
  if (!db) {
    console.warn('writeMachine: Firebase not initialized, skipping write', id);
    return;
  }
  const ref = doc(db, 'machines', id);
  // store timestamps as Firestore Timestamp when numeric
  const payload = { ...data };
  if (payload.expectedFinishTime && typeof payload.expectedFinishTime === 'string') {
    // try to convert ISO string to Timestamp
    const d = Date.parse(payload.expectedFinishTime);
    if (!Number.isNaN(d)) payload.expectedFinishTime = Timestamp.fromMillis(d);
  }
  if (payload.startTime && typeof payload.startTime === 'string') {
    const d = Date.parse(payload.startTime);
    if (!Number.isNaN(d)) payload.startTime = Timestamp.fromMillis(d);
  }
  await setDoc(ref, payload, { merge: true });
}

/**
 * Send a notification (stores in notifications collection). Returns generated id.
 */

/**
 * Helper to fetch rooms or users if needed
 */
export async function fetchRooms() {
  if (!db) throw new Error('Firebase not initialized');
  const snap = await getDocs(collection(db, 'rooms'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}