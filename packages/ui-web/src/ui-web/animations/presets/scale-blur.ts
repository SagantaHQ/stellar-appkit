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
 * scale-blur — the default desktop modal entrance.
 * Enter: opacity 0→1, scale(0.92)→1, blur(12px)→0
 * Exit:  opacity 1→0, scale(1)→0.94, blur(0)→12px
 */
export const scaleBlur: AnimationPreset = {
  enter(el, opts) {
    if (prefersReducedMotion()) return null;
    const { duration, easing } = getOpts(opts);
    return el.animate(
      [
        { opacity: 0, transform: 'scale(0.92)', filter: 'blur(12px)' },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      ],
      { duration, easing, fill: 'forwards' },
    );
  },
  exit(el, opts) {
    if (prefersReducedMotion()) return null;
    const { duration, easing } = getOpts({ ...opts, duration: opts?.duration ?? 200 });
    return el.animate(
      [
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        { opacity: 0, transform: 'scale(0.94)', filter: 'blur(12px)' },
      ],
      { duration, easing, fill: 'forwards' },
    );
  },
};
