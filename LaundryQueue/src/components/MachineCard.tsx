// src/components/MachineCard.tsx
import { useContext, useEffect, useMemo, useState } from 'react';
import type { Machine } from '../context/QueueContext';
import { QueueContext } from '../context/QueueContext';
import { AuthContext } from '../context/AuthContext';
import { EmailModal } from './EmailModal';
import { getUserEmail } from '../utilities/firebasePlaceholder';
import { getAuth } from 'firebase/auth';

const formatRemaining = (finishTs?: string | null) => {
  if (!finishTs) return null;
  const ms = new Date(finishTs).getTime() - Date.now();
  if (ms <= 0) return '00:00';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const MachineCard = ({ machine }: { machine: Machine }) => {
  const ctx = useContext(QueueContext);
  if (!ctx) return null;
  const { startMachine, finishMachine, sendReminder } = ctx;

  // re-render every second to update countdown
  const [nowTick, setNowTick] = useState(0);
  void nowTick; // silence unused warning when optimizers are aggressive

  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const finishTs = useMemo(() => {
    if (machine.expectedFinishTime) return machine.expectedFinishTime;
    if (machine.startTime && machine.durationMin) {
      return new Date(new Date(machine.startTime).getTime() + machine.durationMin * 60_000).toISOString();
    }
    return null;
  }, [machine.expectedFinishTime, machine.startTime, machine.durationMin]);

  const remaining = formatRemaining(finishTs);

  const auth = useContext(AuthContext);
  const [selectedDuration, setSelectedDuration] = useState<number>(machine.durationMin || 35);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(getUserEmail());
  const DURATIONS = [0.1, 35, 45, 60];

  // keep email in sync with Auth (if present)
  useEffect(() => {
    if (auth?.currentUser.email) {
      setUserEmail(auth.currentUser.email);
    }
  }, [auth?.currentUser.email]);

  // ---- Ownership (UID-first, email fallback) ----
  const currentUserEmail = auth?.currentUser.email || userEmail || null;
  const uid = getAuth().currentUser?.uid ?? null;

  // ownerUid may not exist in your Machine type yet; read it defensively
  const ownerUid = (machine as any)?.ownerUid as string | undefined;

  const isOwnerByUid = Boolean(uid && ownerUid && ownerUid === uid);
  const isOwnerByEmail = Boolean(machine.ownerEmail && currentUserEmail && machine.ownerEmail === currentUserEmail);
  const isOwner = isOwnerByUid || (!ownerUid && isOwnerByEmail);

  // ---- Actions ----
  const onStart = async () => {
  const user = getAuth().currentUser;
  if (!user?.uid || !user.email) {
    alert('Please sign in before starting a machine.');
    return;
  }
  const duration = Number(selectedDuration || 0.1);
  try {
    const displayName = auth?.currentUser.username || user.displayName || user.email;
    // keep Context email in sync for any UI that still shows it
    if (auth && auth.currentUser.email !== user.email) {
      auth.setCurrentUser({ ...auth.currentUser, email: user.email });
    }
    await startMachine(machine.id, user.email, duration, displayName);
  } catch (err) {
    console.error('Failed to start machine:', err);
    alert('Failed to start machine. Please try again.');
  }
};

  const onFinish = () => {
    // Client-side guard (server-side rules should also enforce this)
    if (!isOwner) {
      alert('Only the owner can mark this machine as picked up.');
      return;
    }
    finishMachine(machine.id);
  };

  const onReminder = async () => {
    const fromEmail = auth?.currentUser.email || localStorage.getItem('userEmail');
    if (!fromEmail) {
      setShowEmailModal(true);
      return;
    }
    const ok = await sendReminder(machine.id, fromEmail);
    alert(ok ? 'Reminder sent' : 'Cannot send reminder yet. Please wait a minute.');
  };

  // ---- UI ----
  const bg =
    machine.state === 'available'
      ? 'bg-emerald-50'
      : machine.state === 'in-use'
      ? 'bg-rose-50'
      : 'bg-amber-50';
  const blink = machine.state === 'finished' ? 'blink-red' : '';

  return (
    <>
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        machineId={machine.id}
        machineLabel={machine.label}
        onSubmit={async (email) => {
          setUserEmail(email);
          const duration = Number(selectedDuration || 0.1);
          const displayName = auth?.currentUser.username || email;
          if (auth && auth.currentUser.email !== email) {
            auth.setCurrentUser({ ...auth.currentUser, email });
          }
          await startMachine(machine.id, email, duration, displayName);
        }}
      />

      <div className={`p-4 rounded border ${bg} ${blink}`}>
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{machine.label}</div>
          <div className="text-sm text-slate-500">{machine.state}</div>
        </div>

        <div className="mt-2 text-sm">
          {machine.state === 'available' && <div className="text-emerald-700">Available</div>}
          {machine.state === 'in-use' && <div className="text-rose-700">In use — {remaining}</div>}
          {machine.state === 'finished' && <div className="text-amber-700">Finished — ready to pick up</div>}
        </div>

        <div className="mt-4 flex gap-2">
          {machine.state === 'available' && (
            <>
              <select
                aria-label="Duration"
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
              <button
  onClick={(e) => { e.preventDefault(); onStart(); }}
  className="px-3 py-1 bg-emerald-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
  disabled={!getAuth().currentUser?.uid}
  title={getAuth().currentUser?.uid ? 'Start machine' : 'Sign in required'}
>
  Start
</button>
            </>
          )}

          {(machine.state === 'finished' || machine.state === 'in-use') && !isOwner && (
            <button onClick={onReminder} className="px-3 py-1 bg-slate-200 rounded">
              Send reminder
            </button>
          )}

          {machine.state === 'finished' && (
            <button
              onClick={onFinish}
              disabled={!isOwner}
              className={`px-3 py-1 rounded ${
                isOwner ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
              title={isOwner ? 'Mark picked up' : 'Only the owner can mark this machine as picked up'}
            >
              Mark picked up
            </button>
          )}
        </div>

        <div className="mt-2 text-xs text-slate-500">
          {machine.ownerEmail || ownerUid ? (
            isOwner ? (
              <span>Owner: {machine.ownerName || machine.ownerEmail || ownerUid}</span>
            ) : (
              <span>Owner: {machine.ownerName ? machine.ownerName : 'Someone'}</span>
            )
          ) : (
            <span>Owner: —</span>
          )}
        </div>
      </div>
    </>
  );
};

export default MachineCard;
