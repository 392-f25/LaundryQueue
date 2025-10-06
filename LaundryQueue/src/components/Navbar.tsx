import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { QueueContext } from '../context/QueueContext';

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
        <div>
          <div className="text-lg font-medium">Laundry Queue</div>
          <div className="text-sm text-slate-600">Demo — local mock backend</div>
          <div className="text-xs text-slate-500 mt-1 break-all">
            {currentUserEmail ? `Email: ${currentUserEmail}` : 'Email not set'}
          </div>
        </div>

        <div className="flex items-center gap-6">
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
