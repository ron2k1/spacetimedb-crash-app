// crash/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initConnection } from './net/connection';
import { useTaskStore } from './store/taskStore';
import { useDialogStore } from './store/dialogStore';

// Dev-only visual harness: expose the stores so UI/visual QA can drive the panel through the
// REAL reducer (taskStore.applyEvent) without a live engine + provider. `import.meta.env.DEV`
// is statically replaced with `false` by Vite during `vite build`, so this block is tree-shaken
// out of the production bundle -- it never reaches the shipped Tauri app.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__taskStore = useTaskStore;
  (window as unknown as Record<string, unknown>).__dialogStore = useDialogStore;
}

// CRITICAL (SH-03): open the engine connection at module top-level, BEFORE
// ReactDOM.createRoot().render(). The engine can emit session.ready (and early status frames)
// the instant the socket opens; if we deferred the connection to a component's useEffect, those
// first frames could land before any listener is attached and be lost. initConnection() is
// idempotent, so module re-evaluation / StrictMode double-invoke is harmless.
initConnection();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
