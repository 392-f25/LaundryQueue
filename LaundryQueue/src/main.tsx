import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { initFirebase } from './utilities/firebaseRealtime';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged
} from 'firebase/auth';

// 1) Initialize Firebase app first
initFirebase();

// 2) Point Auth to emulator in local dev
const dbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '';
const auth = getAuth();
if (dbUrl.includes('127.0.0.1') || dbUrl.includes('localhost')) {
  // Safe to call more than once
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

// 3) Log the current user (helps you verify UID is present)
onAuthStateChanged(auth, (u) => {
  console.log('[auth] user =', u?.email, 'uid=', u?.uid);
});

console.log('Starting app initialization...');

const root = document.getElementById('root');
if (!root) {
  throw new Error('Failed to find root element');
}

const renderApp = () => {
  try {
    console.log('Rendering app...');
    createRoot(root).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
    console.log('App rendered successfully');
  } catch (error) {
    console.error('Error rendering app:', error);
    document.body.innerHTML = `
      <div style="padding: 20px;">
        <h1>Failed to start app</h1>
        <pre>${error?.toString()}</pre>
      </div>
    `;
  }
};

renderApp();
