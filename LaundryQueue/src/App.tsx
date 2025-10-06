import { useEffect, useState } from 'react';
import { QueueProvider } from './context/QueueContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { MachineGrid } from './components/MachineGrid';
import { initFirebase } from './utilities/firebasePlaceholder';

// Create a Firebase context to ensure initialization
const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      console.log('Starting Firebase initialization...');
      try {
        const result = await initFirebase();
        console.log('Firebase initialized successfully:', result);
        if (mounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize Firebase:', error);
        if (mounted) {
          setError(error instanceof Error ? error : new Error('Failed to initialize Firebase'));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md p-4 bg-white rounded shadow">
          <h1 className="text-xl font-bold text-red-600 mb-4">Failed to initialize app</h1>
          <pre className="text-sm bg-gray-100 p-4 rounded overflow-auto">
            {error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-xl text-center">
          <div className="mb-4">Initializing app...</div>
          <div className="text-sm text-gray-500">If this takes too long, try refreshing the page</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <FirebaseProvider>
      <AuthProvider>
        <QueueProvider>
          <div className="min-h-screen bg-slate-50">
            <Navbar />
            <main className="p-4 max-w-5xl mx-auto">
              <h1 className="text-2xl font-semibold mb-4">Laundry Queue</h1>
              <MachineGrid />
            </main>
          </div>
        </QueueProvider>
      </AuthProvider>
    </FirebaseProvider>
  );
}
