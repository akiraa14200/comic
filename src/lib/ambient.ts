/**
 * YouTube-style Ambient Mode — framework-agnostic, dependency-free.
 *
 * A tiny sampling canvas (long edge ≈ 160px) is painted with the current video
 * frame and placed *behind* the player. The heavy lifting (blur, saturation,
 * scale) is done by CSS on the compositor, so pixels are never read back into
 * JavaScript (no getImageData → no CORS errors, no main-thread stalls).
 *
 * Sources
 *  - HTML5 <video>: real frames via requestVideoFrameCallback (fallback: rAF),
 *    throttled to ≤ 30 fps, with temporal blending to avoid flicker.
 *  - Cross-origin <iframe> (YouTube): frames cannot be read from another origin,
 *    so the glow cross-fades between YouTube's own scene thumbnails
 *    (mqdefault, mq1, mq2, mq3) while the embed is playing.
 *
 * The glow never touches existing player markup, classes or styles. Because the
 * player boxes in this app clip their overflow, the glow is inserted as the
 * previous sibling of the player box and kept aligned to it with a ResizeObserver.
 */

export type AmbientOptions = {
  /** The element whose box the glow should surround (e.g. the player container). */
  host: HTMLElement;
  /** The actual media element. */
  media?: HTMLVideoElement | HTMLIFrameElement | null;
  /** Fallback still images for iframes (ordered scene thumbnails). */
  frames?: string[];
  /** Treat an iframe as already playing (e.g. it was opened by a play button with autoplay). */
  assumePlaying?: boolean;
  /** Blur radius in px. Default: adaptive, ≈9% of the player width (28–80px) so colours stay vivid on phones. */
  blur?: number;
  /** How far the glow spills past each edge, as a fraction of the player size. */
  spread?: { x?: number; top?: number; bottom?: number };
  opacity?: number;     // default 0.6
  saturation?: number;  // default 2
  brightness?: number;  // default 1.1
  scale?: number;       // default 1.2
  fps?: number;         // default 30 (hard cap 30)
  resolution?: number;  // long edge of sampling canvas, default 160
  frameInterval?: number; // legacy, unused
  /** Expected video length in seconds, used to time iframe scene changes (default 150). */
  durationHint?: number;
};

export type AmbientHandle = { destroy: () => void; refresh: () => void };

const STORAGE_KEY = 'rykoc-ambient-mode';
const TOGGLE_EVENT = 'rykoc-ambient-toggle';

/** Global on/off switch (persists in localStorage, applies live to every player). */
export const isAmbientEnabled = () => {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
};
export const setAmbientEnabled = (enabled: boolean) => {
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(TOGGLE_EVENT));
};

const clips = (style: CSSStyleDeclaration) =>
  style.overflow !== 'visible' || /paint|content|strict/.test(style.contain || '') ||
  (style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility === 'auto';

export function createAmbientGlow(options: AmbientOptions): AmbientHandle {
  const { host, media = null } = options;
  const opacity = options.opacity ?? 0.95;
  const saturation = options.saturation ?? 1.3;
  const brightness = options.brightness ?? 1;
  const scale = options.scale ?? 1;
  const spreadX = options.spread?.x ?? 0.1;
  const spreadTop = options.spread?.top ?? 0.2;
  const spreadBottom = options.spread?.bottom ?? 0.55;
  const blurFor = (width: number) => options.blur ?? Math.round(Math.max(28, Math.min(80, width * 0.09)));
  const fps = Math.min(30, options.fps ?? 30);
  const resolution = options.resolution ?? 200;
    // Approximate playback timeline for iframe scenes (YouTube mq1/mq2/mq3 ≈ 25/50/75% of the video).
  const durationHint = Math.max(30, options.durationHint ?? 150) * 1000;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  // ----- DOM: glow layer -------------------------------------------------
  const glow = document.createElement('div');
  glow.className = 'ambient-glow';
  glow.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-glow-canvas';
  glow.appendChild(canvas);
  glow.style.setProperty('--ambient-opacity', String(opacity));
  glow.style.setProperty('--ambient-saturation', String(saturation));
  glow.style.setProperty('--ambient-brightness', String(brightness));
  glow.style.setProperty('--ambient-scale', String(scale));
  // No `desynchronized`: low-latency canvases can stop compositing under CSS filters in Android WebView.
  const ctx = canvas.getContext('2d', { alpha: false });

  // Inside the host if it doesn't clip; otherwise as its previous sibling.
  const hostStyle = getComputedStyle(host);
  const inside = !clips(hostStyle);
  const anchor = inside ? host : host.parentElement;
  if (!anchor || !ctx) return { destroy: () => undefined, refresh: () => undefined };
  inside ? host.insertBefore(glow, host.firstChild) : anchor.insertBefore(glow, host);

  // Only add positioning / stacking context if the anchor lacks them; remember to restore.
  const restore: Array<() => void> = [];
  const anchorStyle = getComputedStyle(anchor);
  if (anchorStyle.position === 'static') {
    const prev = anchor.style.position; anchor.style.position = 'relative';
    restore.push(() => { anchor.style.position = prev; });
  }
  if (anchorStyle.isolation !== 'isolate') {
    const prev = anchor.style.isolation; anchor.style.isolation = 'isolate';
    restore.push(() => { anchor.style.isolation = prev; });
  }
  // Ancestors using content-visibility:auto clip paint; lift that only while the glow exists
  // (the player is on screen, so the off-screen rendering optimisation isn't needed here).
  for (let node: HTMLElement | null = anchor, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
    const cv = (getComputedStyle(node) as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility;
    if (cv === 'auto') {
      const el = node; const prev = el.style.getPropertyValue('content-visibility');
      el.style.setProperty('content-visibility', 'visible');
      restore.push(() => { prev ? el.style.setProperty('content-visibility', prev) : el.style.removeProperty('content-visibility'); });
    }
  }

  let first = true;
  const place = () => {
    const w = host.offsetWidth, h = host.offsetHeight;
    const left = (inside ? 0 : host.offsetLeft) - w * spreadX;
    const top = (inside ? 0 : host.offsetTop) - h * spreadTop;
    glow.style.left = `${left}px`;
    glow.style.top = `${top}px`;
    glow.style.width = `${w * (1 + spreadX * 2)}px`;
    glow.style.height = `${h * (1 + spreadTop + spreadBottom)}px`;
    glow.style.setProperty('--ambient-blur', `${blurFor(w)}px`);
  };
  // The canvas covers the whole glow box; the player occupies an inner rectangle of it.
  const boxW = (w: number) => w * (1 + spreadX * 2);
  const boxH = (h: number) => h * (1 + spreadTop + spreadBottom);
  const sizeCanvas = (w: number, h: number) => {
    if (!w || !h) return;
    const ratio = boxW(w) / boxH(h);
    const cw = Math.max(2, Math.round(ratio >= 1 ? resolution : resolution * ratio));
    const ch = Math.max(2, Math.round(ratio >= 1 ? resolution / ratio : resolution));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; first = true; }
  };
  place();
  sizeCanvas(host.offsetWidth, host.offsetHeight);
  let lastSource: { src: CanvasImageSource; w: number; h: number } | null = null;
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(() => {
    place();
    sizeCanvas(host.offsetWidth, host.offsetHeight);
    if (lastSource && first) drawCover(lastSource.src, lastSource.w, lastSource.h, 1);
  }) : null;
  resizeObserver?.observe(host);
  resizeObserver?.observe(anchor);

  // ----- Drawing ---------------------------------------------------------
  /**
   * Spatially accurate frame painting: the frame is drawn exactly where the player
   * sits, then each edge band of the frame is stretched outward over its own side
   * (top edge → light above, bottom edge → light below, …). After the blur this
   * matches what is on screen next to each edge, like YouTube's own Ambient Mode.
   */
  const drawCover = (source: CanvasImageSource, sw: number, sh: number, alpha: number) => {
    if (!sw || !sh) return false;
    const cw = canvas.width, ch = canvas.height;
    const fx = 1 + spreadX * 2, fy = 1 + spreadTop + spreadBottom;
    const pw = cw / fx, ph = ch / fy, px = (cw - pw) / 2, py = ch * spreadTop / fy;
    // Crop the source to the player's aspect ratio (object-fit: cover).
    const target = pw / ph, srcRatio = sw / sh;
    let cx = 0, cy = 0, cWid = sw, cHei = sh;
    if (srcRatio > target) { cWid = sh * target; cx = (sw - cWid) / 2; } else { cHei = sw / target; cy = (sh - cHei) / 2; }
    const ex = cWid * 0.1, ey = cHei * 0.1; // edge band = outer 10% of the frame
    const right = px + pw, bottom = py + ph;
    try {
      lastSource = { src: source, w: sw, h: sh };
      ctx.globalAlpha = first ? 1 : alpha;
      ctx.drawImage(source, cx, cy, cWid, cHei, px, py, pw, ph);                              // centre
      ctx.drawImage(source, cx, cy, cWid, ey, px, 0, pw, py);                                   // top
      ctx.drawImage(source, cx, cy + cHei - ey, cWid, ey, px, bottom, pw, ch - bottom);         // bottom
      ctx.drawImage(source, cx, cy, ex, cHei, 0, py, px, ph);                                   // left
      ctx.drawImage(source, cx + cWid - ex, cy, ex, cHei, right, py, cw - right, ph);           // right
      ctx.drawImage(source, cx, cy, ex, ey, 0, 0, px, py);                                      // corners
      ctx.drawImage(source, cx + cWid - ex, cy, ex, ey, right, 0, cw - right, py);
      ctx.drawImage(source, cx, cy + cHei - ey, ex, ey, 0, bottom, px, ch - bottom);
      ctx.drawImage(source, cx + cWid - ex, cy + cHei - ey, ex, ey, right, bottom, cw - right, ch - bottom);
    } catch { return false; } // e.g. media not decodable yet
    if (first) { first = false; glow.classList.add('is-ready'); }
    return true;
  };

  // ----- State / scheduling ---------------------------------------------
  let enabled = isAmbientEnabled();
  let onScreen = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let playing = media instanceof HTMLVideoElement ? !media.paused && !media.ended : !!options.assumePlaying;
  let destroyed = false;
  let rafId = 0, vfcId = 0, sceneTimer = 0;
  let lastDraw = 0;
  const shouldRun = () => enabled && onScreen && pageVisible && playing && !destroyed;
  const applyEnabled = () => { glow.classList.toggle('is-off', !enabled); glow.classList.toggle('is-live', shouldRun()); };

  // HTML5 video loop
  const video = media instanceof HTMLVideoElement ? media : null;
  const hasVFC = !!video && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  const minGap = () => (reducedMotion?.matches ? 500 : 1000 / fps);
  const blendAlpha = () => (reducedMotion?.matches ? 1 : 0.3);
  const drawVideo = () => {
    if (!video || video.readyState < 2) return;
    drawCover(video, video.videoWidth, video.videoHeight, blendAlpha());
  };
  const videoTick = (now: number) => {
    vfcId = 0; rafId = 0;
    if (!shouldRun()) return;
    if (now - lastDraw >= minGap()) { lastDraw = now; drawVideo(); }
    scheduleVideo();
  };
  const scheduleVideo = () => {
    if (!video || vfcId || rafId) return;
    if (hasVFC) vfcId = (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: (now: number) => void) => number }).requestVideoFrameCallback(videoTick);
    else rafId = requestAnimationFrame(videoTick);
  };
  const cancelVideo = () => {
    if (vfcId && video) (video as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(vfcId);
    if (rafId) cancelAnimationFrame(rafId);
    vfcId = 0; rafId = 0;
  };

  // Iframe / still-image loop (cross-fade between scene thumbnails)
  const images: HTMLImageElement[] = [];
  let sceneIndex = 0, fadeRaf = 0;
  if (!video && options.frames?.length) {
    for (const src of options.frames) {
      const img = new Image();
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.crossOrigin = 'anonymous'; // i.ytimg.com sends CORS headers; keeps the canvas untainted
      img.onload = () => { if (first || img === images[sceneIndex]) drawCover(img, img.naturalWidth, img.naturalHeight, 1); };
      img.src = src;
      images.push(img);
    }
  }
  const fadeTo = (img: HTMLImageElement) => {
    cancelAnimationFrame(fadeRaf);
    if (!img.complete || !img.naturalWidth) return;
    if (reducedMotion?.matches) { drawCover(img, img.naturalWidth, img.naturalHeight, 1); return; }
    let steps = 0; let last = 0;
    const step = (now: number) => {
      if (destroyed) return;
      if (now - last >= 1000 / 20) { last = now; drawCover(img, img.naturalWidth, img.naturalHeight, 0.09); steps++; }
      if (steps < 36) fadeRaf = requestAnimationFrame(step); // ≈1.8s smooth blend
    };
    fadeRaf = requestAnimationFrame(step);
  };
  // Scene follows elapsed play time: frame 0 is the cover the user just tapped; mq1/mq2/mq3 are
  // YouTube's 25% / 50% / 75% frames, so switch to each one when playback reaches that point.
  let playedMs = 0, playStart = 0;
  const elapsed = () => playedMs + (playStart ? performance.now() - playStart : 0);
  const sceneForTime = () => {
    if (images.length < 2) return 0;
    const progress = elapsed() / durationHint;
    const steps = images.length - 1; // indices 1..n map to 25%, 50%, 75%
    let index = 0;
    for (let i = 1; i <= steps; i++) if (progress >= i / (steps + 1) - 0.08) index = i;
    return index;
  };
  const scheduleScenes = () => {
    if (!playStart) playStart = performance.now();
    if (sceneTimer || images.length < 2) return;
    sceneTimer = window.setInterval(() => {
      if (!shouldRun()) return;
      const next = sceneForTime();
      if (next !== sceneIndex) { sceneIndex = next; fadeTo(images[sceneIndex]); }
    }, 1000);
  };
  const cancelScenes = () => { if (playStart && !(playing && pageVisible)) { playedMs += performance.now() - playStart; playStart = 0; } window.clearInterval(sceneTimer); sceneTimer = 0; cancelAnimationFrame(fadeRaf); };

  const update = () => {
    applyEnabled();
    if (video) { shouldRun() ? scheduleVideo() : cancelVideo(); }
    else { shouldRun() ? scheduleScenes() : cancelScenes(); }
  };

  // ----- Listeners -------------------------------------------------------
  const cleanups: Array<() => void> = [];
  const on = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  if (video) {
    const setPlaying = (value: boolean) => () => { playing = value; update(); };
    on(video, 'playing', setPlaying(true));
    on(video, 'play', setPlaying(true));
    on(video, 'pause', setPlaying(false));
    on(video, 'ended', setPlaying(false));
    on(video, 'emptied', setPlaying(false));
    on(video, 'loadeddata', () => drawVideo());
    on(video, 'seeked', () => drawVideo()); // keep glow in sync when scrubbing while paused
    drawVideo();
  } else if (media instanceof HTMLIFrameElement) {
    // A cross-origin player gives no play events; the first click into it moves focus
    // to the iframe and blurs the window — treat that as "user started playback".
    on(window, 'blur', () => {
      if (document.activeElement === media && !playing) { playing = true; update(); }
    });
  }
  on(document, 'visibilitychange', () => { pageVisible = document.visibilityState !== 'hidden'; update(); });
  on(window, TOGGLE_EVENT, () => { enabled = isAmbientEnabled(); update(); });
  on(window, 'storage', (event) => { if ((event as StorageEvent).key === STORAGE_KEY) { enabled = isAmbientEnabled(); update(); } });
  on(window, 'resize', place, { passive: true });

  const intersection = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting); update();
  }, { rootMargin: '120px 0px' }) : null;
  intersection?.observe(host);

  update();

  return {
    refresh: () => { place(); update(); },
    destroy: () => {
      destroyed = true;
      cancelVideo(); cancelScenes();
      resizeObserver?.disconnect(); intersection?.disconnect();
      cleanups.forEach(fn => fn());
      restore.forEach(fn => fn());
      for (const img of images) { img.onload = null; img.src = ''; }
      glow.remove();
    }
  };
}

/** YouTube scene thumbnails (16:9, no letterbox) usable as cross-origin-safe glow frames. */
export function youtubeAmbientFrames(videoId: string | null | undefined) {
  if (!videoId || !/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return [];
  return ['mqdefault', 'mq1', 'mq2', 'mq3'].map(name => `https://i.ytimg.com/vi/${videoId}/${name}.jpg`);
}
