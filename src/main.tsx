import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// Register the offline shell and keep the native install prompt available to Settings.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Ryko service worker registration failed:', error)); });
}
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  (window as any).__rykoInstallPrompt = event;
  window.dispatchEvent(new Event('ryko:install-available'));
});
window.addEventListener('appinstalled', () => {
  (window as any).__rykoInstallPrompt = null;
  window.dispatchEvent(new Event('ryko:install-available'));
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);