type Listener = (data: Record<string, any> | null) => void;

const state = {
  rooms: {
    default: { name: 'Default Room' },
  } as Record<string, any>,
  machines: {
    default: {
      m1: { id: 'm1', label: 'W1', state: 'available' },
      m2: { id: 'm2', label: 'W2', state: 'available' },
      m3: { id: 'm3', label: 'W3', state: 'available' },
      m4: { id: 'm4', label: 'D1', state: 'available' },
      m5: { id: 'm5', label: 'D2', state: 'available' },
      m6: { id: 'm6', label: 'D3', state: 'available' },
    },
  } as Record<string, Record<string, any>>,
};

const roomListeners: Listener[] = [];
const machineListeners: Record<string, Listener[]> = {};

export function initFirebase() {
  // noop for mock
  return {};
}

export function subscribeToRooms(cb: Listener) {
  roomListeners.push(cb);
  cb(state.rooms);
  return () => {
    const idx = roomListeners.indexOf(cb);
    if (idx >= 0) roomListeners.splice(idx, 1);
  };
}

export function subscribeToMachinesForRoom(roomId: string, cb: Listener) {
  machineListeners[roomId] = machineListeners[roomId] || [];
  machineListeners[roomId].push(cb);
  cb(state.machines[roomId] ?? null);
  return () => {
    const arr = machineListeners[roomId] || [];
    const idx = arr.indexOf(cb);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

function notifyRoomListeners() {
  for (const l of roomListeners) {
    l(state.rooms);
  }
}

function notifyMachineListeners(roomId: string) {
  const arr = machineListeners[roomId] || [];
  const payload = state.machines[roomId] ?? null;
  for (const l of arr) l(payload);
}

export async function writeMachines(map: Record<string, any>, roomId?: string) {
  if (roomId) {
    state.machines[roomId] = { ...map };
    notifyMachineListeners(roomId);
  } else {
    // global machines
    state.machines['default'] = { ...map };
    notifyMachineListeners('default');
  }
}

export async function writeMachine(id: string, data: Record<string, any>, roomId?: string) {
  const r = roomId || 'default';
  state.machines[r] = state.machines[r] || {};
  state.machines[r][id] = { ...data };
  notifyMachineListeners(r);
}

export async function sendNotification(payload: { recipientEmail: string; message: string; timestamp: number }) {
  // return mock id
  return `mock-${payload.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fetchMachinesForRoom(roomId: string) {
  return state.machines[roomId] ?? null;
}

export async function startMachineTransaction(roomId: string, machineId: string, updatedFields: Record<string, any>) {
  state.machines[roomId] = state.machines[roomId] || {};
  const current = state.machines[roomId][machineId] || null;
  if (current && current.state === 'in-use') return false;
  state.machines[roomId][machineId] = { ...(current || {}), ...updatedFields };
  notifyMachineListeners(roomId);
  return true;
}

export async function finishMachineTransaction(roomId: string, machineId: string, resetFields: Record<string, any>) {
  state.machines[roomId] = state.machines[roomId] || {};
  const current = state.machines[roomId][machineId] || null;
  if (!current) return false;
  state.machines[roomId][machineId] = { ...(current || {}), ...resetFields };
  notifyMachineListeners(roomId);
  return true;
}

export default {
  initFirebase,
  subscribeToRooms,
  subscribeToMachinesForRoom,
  writeMachine,
  writeMachines,
  sendNotification,
  fetchMachinesForRoom,
  startMachineTransaction,
  finishMachineTransaction,
};
