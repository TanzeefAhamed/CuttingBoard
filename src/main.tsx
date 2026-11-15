import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initSampleMedia } from './editor/sampleMedia';
import { useStore } from './store';

// Expose on window for browser QA automation
(window as any).__CUTTINGBOARD_INIT_SAMPLE__ = initSampleMedia;
(window as any).__CUTTINGBOARD_STORE__ = useStore;

// Initialize sample media immediately on app load
initSampleMedia();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);