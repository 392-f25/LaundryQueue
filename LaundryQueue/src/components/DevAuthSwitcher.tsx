// src/components/DevAuthSwitcher.tsx
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';

export default function DevAuthSwitcher() {
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    // Point to emulator in dev
    try {
      const auth = getAuth();
      const url = import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '';
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        // safe to call multiple times
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
    } catch {}
  }, []);

  async function signAs(email: string, pass = 'password123') {
    const auth = getAuth();
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      if (e?.code === 'auth/user-not-found') {
        await createUserWithEmailAndPassword(auth, email, pass);
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        console.error(e);
      }
    }
    setWho(getAuth().currentUser?.email ?? null);
    alert(`Signed in: ${getAuth().currentUser?.email}\nuid: ${getAuth().currentUser?.uid}`);
  }

  const authed = getAuth().currentUser;

  return (
    <div className="fixed bottom-3 right-3 flex gap-2 p-2 bg-white/90 border rounded shadow text-xs">
      <button className="px-2 py-1 border rounded" onClick={() => signAs('TestA@example.com')}>
        Sign in TestA
      </button>
      <button className="px-2 py-1 border rounded" onClick={() => signAs('TestB@example.com')}>
        Sign in TestB
      </button>
      <button
        className="px-2 py-1 border rounded"
        onClick={() => { signOut(getAuth()); setWho(null); }}
      >
        Sign out
      </button>
      <span className="ml-2 text-slate-600">
        {authed ? `👤 ${authed.email}` : 'not signed in'}
      </span>
    </div>
  );
}
