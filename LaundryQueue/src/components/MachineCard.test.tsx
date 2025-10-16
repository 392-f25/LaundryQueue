import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { QueueContext } from '../context/QueueContext';
import { MachineCard } from './MachineCard';
import type { Machine } from '../context/QueueContext';

vi.mock('../utilities/firebaseRealtime', () => ({
  initFirebase: () => ({}),
  useAuthState: () => ({ user: { email: 'demo@example.com' } }),
}));

const makeQueueValue = () => ({
  machines: [],
  startMachine: vi.fn(),
  finishMachine: vi.fn(),
  sendReminder: vi.fn(async () => true),
  skipToFinished: vi.fn(),
  getNotifications: () => [],
  clearNotifications: () => {},
  rooms: [],
  currentRoomId: 'default',
  setCurrentRoom: vi.fn(),
});

const machineOwned: Machine = {
  id: 'm1',
  label: 'W1',
  state: 'in-use',
  ownerEmail: 'demo@example.com',
  startTime: new Date().toISOString(),
  durationMin: 30,
};

describe('MachineCard reminder visibility', () => {
  it('does not show Send reminder to the owner', () => {
    const authValue = {
      currentUser: { id: 'owner', username: 'Owner', email: 'demo@example.com' },
      setCurrentUser: vi.fn(),
      users: [],
      addUser: vi.fn(),
    };

    render(
      <AuthContext.Provider value={authValue as any}>
        <QueueContext.Provider value={makeQueueValue() as any}>
          <MachineCard machine={machineOwned} />
        </QueueContext.Provider>
      </AuthContext.Provider>,
    );

    const btn = screen.queryByText('Send reminder');
    expect(btn).toBeNull();
  });

  it('shows Send reminder to other users', async () => {
    const authValue = {
      currentUser: { id: 'other-user', username: 'Other', email: 'other@example.com' },
      setCurrentUser: vi.fn(),
      users: [],
      addUser: vi.fn(),
    };

    render(
      <AuthContext.Provider value={authValue as any}>
        <QueueContext.Provider value={makeQueueValue() as any}>
          <MachineCard machine={machineOwned} />
        </QueueContext.Provider>
      </AuthContext.Provider>,
    );

    const btn = await screen.findByText('Send reminder');
    expect(btn).toBeTruthy();
  });
});
