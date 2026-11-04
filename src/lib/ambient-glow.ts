/**
 * Ambient video glow for same-origin/CORS-enabled HTMLVideoElement sources.
 * YouTube and other cross-origin iframes cannot be sampled; those use the
 * blurred-thumbnail fallback attached by the video card.
 */
export function attachVideoAmbientGlow(container: HTMLElement, video: HTMLVideoElement): () => void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return () => undefined;
  const width = 140;
  const ratio = Math.max(1, video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16);
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * ratio));
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:-18%;width:136%;height:136%;z-index:0;pointer-events:none;filter:blur(90px) brightness(1.12) saturate(1.55);transform:scale(1.08);opacity:.88;';
  container.style.position ||= 'relative';
  container.insertBefore(canvas, container.firstChild);
  let frame = 0;
  let lastPaint = 0;
  let disposed = false;
  const paint = (time: number) => {
    if (disposed || video.paused || video.ended || document.hidden) { frame = 0; return; }
    if (time - lastPaint >= 1000 / 24 && video.readyState >= 2) {
      try { context.drawImage(video, 0, 0, canvas.width, canvas.height); lastPaint = time; }
      catch { stop(); return; }
    }
    frame = requestAnimationFrame(paint);
  };
  const start = () => { if (!disposed && !frame && !video.paused && !document.hidden) frame = requestAnimationFrame(paint); };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const onVisibility = () => document.hidden ? stop() : start();
  video.addEventListener('play', start);
  video.addEventListener('playing', start);
  video.addEventListener('pause', stop);
  video.addEventListener('ended', stop);
  document.addEventListener('visibilitychange', onVisibility);
  start();
  return () => {
    disposed = true;
    stop();
    video.removeEventListener('play', start);
    video.removeEventListener('playing', start);
    video.removeEventListener('pause', stop);
    video.removeEventListener('ended', stop);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.remove();
  };
}
