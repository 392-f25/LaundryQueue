import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueueProvider, QueueContext } from './QueueContext';
import { AuthProvider } from './AuthContext';
import { useContext, useEffect } from 'react';

const OWNER_EMAIL = 'demo@example.com';
const REMINDER_EMAIL = 'other@example.com';

const TestApp = () => {
  const q = useContext(QueueContext)!;

  useEffect(() => {
    q.startMachine('m1', OWNER_EMAIL, 0.001, 'Demo User');
  }, [q]);

  useEffect(() => {
    const run = async () => {
      const machine = q.machines.find((x) => x.id === 'm1');
      const outlet = document.getElementById('out');
      if (!machine || !outlet || outlet.dataset.done === '1') return;
      if (machine.state !== 'finished') return;

      const ok = await q.sendReminder('m1', REMINDER_EMAIL);
      const notes = q.getNotifications(OWNER_EMAIL);
      outlet.textContent = `${ok ? 'ok' : 'no'}|${notes.length}|${notes[0]?.message || ''}`;
      outlet.dataset.done = '1';
    };

    run();
  }, [q, q.machines]);

  return <div id="out" data-done="0" />;
};

describe('QueueContext notifications', () => {
  it('pushes a notification to owner when reminder is sent', async () => {
    render(
      <AuthProvider>
        <QueueProvider>
          <TestApp />
        </QueueProvider>
      </AuthProvider>,
    );

    const out = await screen.findByText(/ok\|1\|/);
    expect(out).toBeTruthy();
  });
});
