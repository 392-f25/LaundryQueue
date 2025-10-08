import { useContext, useEffect, useMemo, useState } from 'react';
import type { Machine } from '../context/QueueContext';
import { QueueContext } from '../context/QueueContext';
import { AuthContext } from '../context/AuthContext';
import { EmailModal } from './EmailModal';
import { getUserEmail } from '../utilities/firebasePlaceholder';

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
  const [nowTick, setNowTick] = useState(0);
  // nowTick forces re-render every second; underscore usage prevents "unused" lint in some configs
  void nowTick;

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

  useEffect(() => {
    if (auth?.currentUser.email) {
      setUserEmail(auth.currentUser.email);
    }
  }, [auth?.currentUser.email]);

  const currentUserEmail = auth?.currentUser.email || userEmail || null;
  const currentUserName = auth?.currentUser.username || null;
  
  // Check ownership by email first, then by name as fallback
  const isOwner = Boolean(
    (machine.ownerEmail && currentUserEmail && machine.ownerEmail === currentUserEmail) ||
    (machine.ownerName && currentUserName && machine.ownerName === currentUserName)
  );

  const onStart = async () => {
    console.log('onStart called', { userEmail, machine });
    if (!userEmail) {
      console.log('No user email, showing modal');
      setShowEmailModal(true);
      return;
    }
    const duration = Number(selectedDuration || 0.1);
    try {
      const displayName = auth?.currentUser.username || userEmail;
      if (auth && auth.currentUser.email !== userEmail) {
        auth.setCurrentUser({ ...auth.currentUser, email: userEmail });
      }
      await startMachine(machine.id, userEmail, duration, displayName);
      console.log('Machine started successfully');
    } catch (error) {
      console.error('Failed to start machine:', error);
      alert('Failed to start machine. Please try again.');
    }
  };

  const onFinish = () => {
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

  const bg = machine.state === 'available' ? 'bg-emerald-50' : machine.state === 'in-use' ? 'bg-rose-50' : 'bg-amber-50';
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
            <select aria-label="Duration" value={selectedDuration} onChange={(e) => setSelectedDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
            <button 
    onClick={(e) => {
      e.preventDefault();
      console.log('Start button clicked');
      onStart();
    }} 
    className="px-3 py-1 bg-emerald-600 text-white rounded"
  >
    Start
  </button>
          </>
        )}
        {machine.state === 'finished' && !isOwner && (
          <button onClick={onReminder} className="px-3 py-1 bg-slate-200 rounded">Send reminder</button>
        )}
        {machine.state === 'in-use' && isOwner && (
          <button onClick={onFinish} className="px-3 py-1 bg-red-500 text-white rounded">Cancel</button>
        )}
        {machine.state === 'finished' && isOwner && (
          <button onClick={onFinish} className="px-3 py-1 bg-emerald-500 text-white rounded">Mark picked up</button>
        )}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {machine.ownerEmail ? (
          isOwner ? (
            <span>Owner: {machine.ownerName || machine.ownerEmail}</span>
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
