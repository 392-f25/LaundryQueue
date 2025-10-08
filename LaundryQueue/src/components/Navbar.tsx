import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { QueueContext } from '../context/QueueContext';
import { writeMachine } from '../utilities/firebasePlaceholder';

export const Navbar = () => {
  const auth = useContext(AuthContext);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const existing = auth?.users.find((u) => u.id === v);
    if (existing) auth?.setCurrentUser(existing);
  };

  const onAddUser = () => {
    const name = prompt('New user name');
    if (name && name.trim()) {
      auth?.addUser(name.trim());
    }
  };

  const queue = useContext(QueueContext);
  const [open, setOpen] = useState(false);
  const currentUserEmail = auth?.currentUser.email || null;
  const notes = currentUserEmail ? queue?.getNotifications(currentUserEmail) || [] : [];

  const onClear = () => {
    if (!currentUserEmail) return;
    queue?.clearNotifications(currentUserEmail);
    setOpen(false);
  };

  return (
    <header className="bg-white shadow">
      <div className="max-w-5xl mx-auto p-4 flex items-center justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="Laundry Queue logo"
            style={{ height: 36 }}
            onError={(e) => {
              // hide broken image and leave the alt text visible
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
          <div>
            <div className="text-sm text-slate-600">Demo — local mock backend</div>
            <div className="text-xs text-slate-500 mt-1 break-all">
              {currentUserEmail ? `Email: ${currentUserEmail}` : 'Email not set'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <button
              title="Skip forward so the next-finishing machine finishes in 10s"
              onClick={async () => {
                if (!queue) return;
                const now = Date.now();

                // Find the in-use machine with the earliest expected finish time
                const candidates = queue.machines
                  .filter((m) => m.state === 'in-use' && m.expectedFinishTime)
                  .map((m) => ({ m, ts: Date.parse(m.expectedFinishTime as string) }))
                  .filter((x) => !Number.isNaN(x.ts))
                  .sort((a, b) => a.ts - b.ts);

                if (candidates.length === 0) {
                  alert('No running machines to skip.');
                  return;
                }

                const target = candidates[0].m;
                const oldTargetTs = Date.parse(target.expectedFinishTime as string);
                const newTargetTs = now + 10_000; // target will finish in 10s from now
                const delta = newTargetTs - oldTargetTs; // may be negative (move earlier)

                // Shift all in-use machines by the same delta
                const updates = queue.machines
                  .filter((m) => m.state === 'in-use' && m.expectedFinishTime)
                  .map((m) => {
                    const old = Date.parse(m.expectedFinishTime as string);
                    if (Number.isNaN(old)) return null;
                    return { ...m, expectedFinishTime: new Date(old + delta).toISOString() };
                  })
                  .filter(Boolean) as Array<Record<string, any>>;

                try {
                  await Promise.all(updates.map((m) => writeMachine(m.id, m)));
                  alert(`${target.label} will finish in 10 seconds; all running machines shifted by ${Math.round(delta / 1000)}s.`);
                } catch (err) {
                  console.error('Failed to skip forward', err);
                  alert('Failed to skip forward');
                }
              }}
              className="px-2 py-1 text-sm bg-slate-100 rounded"
            >
              Skip →
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <button aria-label="Notifications" onClick={() => setOpen((s) => !s)} className="text-sm px-2 py-1">🔔 {notes.length > 0 ? `(${notes.length})` : ''}</button>
            {open && (
              <div style={{ position: 'absolute', right: 0, top: '2.25rem', background: 'white', border: '1px solid #eee', padding: '0.75rem', width: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>Notifications</div>
                  <button onClick={onClear} style={{ fontSize: 12 }}>Clear</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {notes.length === 0 && <div style={{ fontSize: 13, color: '#666' }}>No notifications</div>}
                  {notes.map((n) => (
                    <div key={n.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 14 }}>{n.message}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{new Date(n.ts).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select aria-label="Switch user" onChange={onChange} value={auth?.currentUser.id} className="text-sm px-2 py-1">
              {auth?.users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
            <button onClick={onAddUser} className="text-sm px-2 py-1">+ Add user</button>
          </div>
        </div>
      </div>
    </header>
  );
};
