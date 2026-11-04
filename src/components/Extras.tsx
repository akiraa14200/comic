import { useEffect, useState } from 'react';
import { Share2, WifiOff } from 'lucide-react';

/* ---------- Toast ---------- */
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent('rykoc-toast', { detail: message }));
}
export function ToastHost() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer = 0;
    const onToast = (event: Event) => {
      setMessage(String((event as CustomEvent).detail || ''));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(''), 2400);
    };
    window.addEventListener('rykoc-toast', onToast);
    return () => { window.removeEventListener('rykoc-toast', onToast); window.clearTimeout(timer); };
  }, []);
  return <div className={message ? 'rykoc-toast show' : 'rykoc-toast'} role="status" aria-live="polite">{message}</div>;
}

/* ---------- Offline banner ---------- */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => { setOnline(true); showToast('Back online'); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return <div className="offline-banner" role="status"><WifiOff size={15}/> You are offline. Showing saved content where available.</div>;
}

/* ---------- Airing countdown ---------- */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), intervalMs); return () => window.clearInterval(id); }, [intervalMs]);
  return now;
}
export function formatCountdown(airingAtSeconds: number, now = Date.now()) {
  const diff = Math.max(0, airingAtSeconds * 1000 - now);
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (diff <= 0) return 'now';
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

/* ---------- Share ---------- */
export async function shareLink(title: string, url: string) {
  try {
    if (navigator.share) { await navigator.share({ title, text: title, url }); return; }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
  }
  try { await navigator.clipboard.writeText(url); showToast('Link copied'); }
  catch { showToast(url); }
}
export function ShareButton({ title, url, className = 'secondary-btn' }: { title: string; url: string; className?: string }) {
  return <button type="button" className={className} onClick={() => void shareLink(title, url)}><Share2 size={15}/> Share</button>;
}

/* ---------- Recent searches ---------- */
const RECENT_KEY = 'rykoc-recent-searches';
export function readRecentSearches(): string[] {
  try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 8) : []; }
  catch { return []; }
}
export function pushRecentSearch(term: string) {
  const clean = term.trim();
  if (clean.length < 2) return readRecentSearches();
  const next = [clean, ...readRecentSearches().filter(v => v.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
export function clearRecentSearches() { localStorage.removeItem(RECENT_KEY); }
