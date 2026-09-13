import './landing.css';

/**
 * Scroll-scrubbed keyframe animation. The hero video was generated with
 * Higgsfield and sliced into individual frames (public/frames); scrolling
 * through the hero section scrubs through them like a flipbook.
 *
 * Two things keep it smooth and readable:
 * - The scroll→frame map has dwells: while a caption is on screen the
 *   handset barely moves, and the big motion happens between captions.
 * - Frames render fractionally (two adjacent frames crossfaded) with a
 *   little inertia, so a slow scroll sweeps instead of stepping.
 */

const FRAME_COUNT = 61;
const frameSrc = (i: number) => `${import.meta.env.BASE_URL}frames/f${String(i + 1).padStart(3, '0')}.jpg`;

/** progress → frame position (fraction of the last frame), with dwells. */
const FRAME_MAP: [number, number][] = [
  [0, 0],
  [0.26, 0.1], // reading caption 1: barely moves
  [0.37, 0.46], // caption swap: the handset takes off
  [0.63, 0.6], // reading caption 2: slow drift
  [0.74, 0.95], // caption swap: the lift completes
  [1, 1], // reading caption 3: at rest, hovering
];

/** Which scroll range each caption owns. */
const COPY_RANGES: [number, number][] = [
  [0, 0.26],
  [0.37, 0.63],
  [0.74, 1.01],
];

const canvas = document.getElementById('frame-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scrub = document.getElementById('scrub')!;
const progressFill = document.getElementById('progress-fill')!;
const copies = [document.getElementById('copy-1')!, document.getElementById('copy-2')!, document.getElementById('copy-3')!];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const frames: (HTMLImageElement | null)[] = Array.from({ length: FRAME_COUNT }, () => null);
let shownPos = 0; // frame position currently rendered (float, eased)
let targetPos = 0; // frame position scroll is asking for
let lastDrawnKey = '';

function frameAt(progress: number): number {
  for (let i = 1; i < FRAME_MAP.length; i++) {
    const [p1, f1] = FRAME_MAP[i - 1];
    const [p2, f2] = FRAME_MAP[i];
    if (progress <= p2) {
      const t = (progress - p1) / (p2 - p1);
      return (f1 + (f2 - f1) * t) * (FRAME_COUNT - 1);
    }
  }
  return FRAME_COUNT - 1;
}

function loadFrame(i: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      frames[i] = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = frameSrc(i);
  });
}

function nearestLoaded(index: number): HTMLImageElement | null {
  return frames[index] ?? frames.slice(0, index).reverse().find(Boolean) ?? frames.find(Boolean) ?? null;
}

function placement(img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  // On wide screens, park the phone right of center so the copy owns the
  // empty paper on the left; on narrow screens keep it centered.
  const focal = w > h * 0.96 ? 0.66 : 0.5;
  const dx = Math.min(0, Math.max(w - dw, w * focal - dw * 0.5));
  return { dx, dy: (h - dh) / 2, dw, dh };
}

function drawPosition(pos: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    lastDrawnKey = '';
  }

  const base = Math.min(FRAME_COUNT - 1, Math.floor(pos));
  const frac = Math.min(1, Math.max(0, pos - base));
  const a = nearestLoaded(base);
  if (!a) return;
  const b = frac > 0.01 ? frames[base + 1] : null;

  const key = `${base}:${b ? frac.toFixed(2) : 'x'}`;
  if (key === lastDrawnKey) return;
  lastDrawnKey = key;

  const pa = placement(a, w, h);
  ctx.globalAlpha = 1;
  ctx.drawImage(a, pa.dx, pa.dy, pa.dw, pa.dh);
  if (b) {
    // Fractional frame: crossfade toward the next keyframe.
    const pb = placement(b, w, h);
    ctx.globalAlpha = frac;
    ctx.drawImage(b, pb.dx, pb.dy, pb.dw, pb.dh);
    ctx.globalAlpha = 1;
  }
}

function progressNow(): number {
  const rect = scrub.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  return total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
}

function updateOverlay(progress: number) {
  copies.forEach((el, i) => {
    const [from, to] = COPY_RANGES[i];
    const inside = progress >= from && progress < to;
    el.hidden = !inside;
    if (!inside) return;
    const fade = (to - from) * 0.18;
    const fadeIn = from === 0 ? 1 : Math.min(1, (progress - from) / fade);
    const fadeOut = to > 1 ? 1 : Math.min(1, (to - progress) / fade);
    const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    el.style.opacity = String(opacity);
    el.style.transform = `translateY(${((1 - opacity) * 10).toFixed(1)}px)`;
  });
  progressFill.style.transform = `scaleX(${progress})`;
}

let animating = false;
let lastTick = 0;

function animate() {
  lastTick = Date.now();
  const diff = targetPos - shownPos;
  if (Math.abs(diff) < 0.02) {
    shownPos = targetPos;
    drawPosition(shownPos);
    animating = false;
    return;
  }
  shownPos += diff * 0.16;
  drawPosition(shownPos);
  requestAnimationFrame(animate);
}

function onScroll() {
  const progress = reducedMotion ? 1 : progressNow();
  updateOverlay(progress);
  targetPos = frameAt(progress);
  // rAF eases toward the target for smooth slow scrubbing; when rAF is
  // throttled (hidden or embedded views), draw the exact frame directly.
  if (animating && Date.now() - lastTick > 150) {
    shownPos = targetPos;
    drawPosition(shownPos);
    return;
  }
  if (!animating) {
    animating = true;
    lastTick = Date.now();
    requestAnimationFrame(animate);
  }
}

async function start() {
  if (reducedMotion) {
    await loadFrame(FRAME_COUNT - 1).catch(() => undefined);
    shownPos = targetPos = FRAME_COUNT - 1;
    drawPosition(shownPos);
    updateOverlay(1);
    return;
  }
  await loadFrame(0).catch(() => undefined);
  drawPosition(0);
  updateOverlay(progressNow());
  const rest = Array.from({ length: FRAME_COUNT - 1 }, (_, i) => i + 1);
  let index = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (index < rest.length) {
      const next = rest[index++];
      await loadFrame(next).catch(() => undefined);
      if (Math.abs(next - shownPos) <= 1) {
        lastDrawnKey = '';
        drawPosition(shownPos);
      }
    }
  });
  await Promise.all(workers);
  lastDrawnKey = '';
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  lastDrawnKey = '';
  onScroll();
});
start();
