import type { AnimationPreset, AnimationOptions } from '../types.js';
import { prefersReducedMotion } from '../reduced-motion.js';

const DEFAULT_DURATION = 300;
const DEFAULT_EASING = 'cubic-bezier(.16,1,.3,1)';

function getOpts(opts?: AnimationOptions) {
  return {
    duration: opts?.duration ?? DEFAULT_DURATION,
    easing: opts?.easing ?? DEFAULT_EASING,
  };
}

/**
 * slide-up — the default bottom-sheet entrance.
 * Enter: translateY(100%)→0, opacity 0→1
 * Exit:  translateY(0)→100%, opacity 1→0
 */
export const slideUp: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    const { duration, easing } = getOpts(opts);
    return el.animate(
      [
        { transform: 'translateY(100%)', opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      { duration, easing, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    const { duration, easing } = getOpts({ ...opts, duration: opts?.duration ?? 200 });
    return el.animate(
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(100%)', opacity: 0 },
      ],
      { duration, easing, fill: 'forwards' },
    );
  },
};
