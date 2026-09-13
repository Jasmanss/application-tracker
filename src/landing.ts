import './landing.css';

/**
 * Scroll-scrubbed keyframe animation. The hero video was generated with
 * Higgsfield and sliced into individual frames (public/frames); scrolling
 * through the hero section scrubs through them like a flipbook.
 */

const FRAME_COUNT = 61;
const frameSrc = (i: number) => `${import.meta.env.BASE_URL}frames/f${String(i + 1).padStart(3, '0')}.jpg`;

const canvas = document.getElementById('frame-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scrub = document.getElementById('scrub')!;
const progressFill = document.getElementById('progress-fill')!;
const copies = [document.getElementById('copy-1')!, document.getElementById('copy-2')!, document.getElementById('copy-3')!];
// Which scroll range each block of copy owns.
const COPY_RANGES: [number, number][] = [
  [0, 0.3],
  [0.36, 0.66],
  [0.72, 1.01],
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const frames: (HTMLImageElement | null)[] = Array.from({ length: FRAME_COUNT }, () => null);
let drawnFrame = -1;
let currentFrame = 0;

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

function draw(index: number) {
  const img = frames[index] ?? frames.slice(0, index).reverse().find(Boolean) ?? frames.find(Boolean);
  if (!img) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    drawnFrame = -1;
  }
  if (drawnFrame === index) return;
  drawnFrame = index;
  // Cover the canvas, keeping the phone centered.
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function progressNow(): number {
  const rect = scrub.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  return total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
}

function update() {
  const progress = reducedMotion ? 1 : progressNow();
  currentFrame = Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
  draw(currentFrame);

  copies.forEach((el, i) => {
    const [from, to] = COPY_RANGES[i];
    const inside = progress >= from && progress < to;
    el.hidden = !inside;
    if (!inside) return;
    const fade = (to - from) * 0.2;
    // The first block starts visible; the last never fades out.
    const fadeIn = from === 0 ? 1 : Math.min(1, (progress - from) / fade);
    const fadeOut = to > 1 ? 1 : Math.min(1, (to - progress) / fade);
    el.style.opacity = String(Math.max(0, Math.min(fadeIn, fadeOut)));
  });
  progressFill.style.transform = `scaleX(${progress})`;
}

// Direct update on scroll: it draws only when the frame index changes,
// so it's cheap, and it never stalls when rAF is throttled.
const requestUpdate = update;

async function start() {
  if (reducedMotion) {
    // No scrubbing: show the final resting frame with the closing copy.
    await loadFrame(FRAME_COUNT - 1).catch(() => undefined);
    update();
    return;
  }
  // First frame paints immediately; the rest stream in behind it.
  await loadFrame(0).catch(() => undefined);
  update();
  const rest = Array.from({ length: FRAME_COUNT - 1 }, (_, i) => i + 1);
  let index = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (index < rest.length) {
      const next = rest[index++];
      await loadFrame(next).catch(() => undefined);
      if (next === currentFrame) {
        drawnFrame = -1;
        requestUpdate();
      }
    }
  });
  await Promise.all(workers);
  requestUpdate();
}

window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener('resize', requestUpdate);
start();
