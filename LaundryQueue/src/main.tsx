import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

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
