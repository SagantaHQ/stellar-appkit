/**
 * Motion-based animation system for the Stellar AppKit modal.
 *
 * Uses `motion` from motion.dev as the core animation engine — replaces all
 * custom WAAPI code and the hand-rolled spring physics engine.
 *
 * Three classes:
 * 1. ModalMotionAnimator — desktop modal open/close animations
 * 2. BottomsheetMotionAnimator — bottomsheet open/close animations
 * 3. BottomsheetMotionDragController — drag-to-dismiss gestures (in separate file)
 *
 * All classes are vanilla JS (no React/Vue/Solid/Svelte dependencies),
 * Shadow DOM safe, and respect prefers-reduced-motion.
 */

import { animate, type AnimationPlaybackControls } from 'motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnimationPresetName =
  | 'none'
  | 'fade'
  | 'scale'
  | 'scale-blur'
  | 'slide-up'
  | 'slide-left'
  | 'implode';

// Pragmatic type aliases — Motion's TypeScript types are extremely complex
// with multiple overloads. The runtime API is permissive; we cast to bypass
// the strict type checking while maintaining type safety at the call sites.
type Keyframes = Record<string, unknown[]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnimOptions = Record<string, any>;

// ---------------------------------------------------------------------------
// Reduced motion helper
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Spring configurations
// ---------------------------------------------------------------------------

/** Modal open — gentle rubber-like pop with slight overshoot */
const MODAL_OPEN_SPRING: AnimOptions = { type: 'spring', stiffness: 280, damping: 22, mass: 0.9 };

/** Modal close — fast, controlled, no bounce */
const MODAL_CLOSE_DURATION = 0.2; // 200ms

/** Bottomsheet open — fluid spring slide-up with subtle overshoot */
const BOTTOMSHEET_OPEN_SPRING: AnimOptions = { type: 'spring', stiffness: 340, damping: 28, mass: 1 };

/** Bottomsheet close — smooth slide down */
const BOTTOMSHEET_CLOSE_DURATION = 0.25; // 250ms

/** Snap-back spring — firm but smooth, settles quickly */
const SNAP_BACK_SPRING: AnimOptions = { type: 'spring', stiffness: 400, damping: 35, mass: 0.9 };

/** Dismissal spring — carries sheet offscreen */
const DISMISS_SPRING: AnimOptions = { type: 'spring', stiffness: 300, damping: 30, mass: 1 };

// ---------------------------------------------------------------------------
// ModalMotionAnimator
// ---------------------------------------------------------------------------

export class ModalMotionAnimator {
  private current: AnimationPlaybackControls | null = null;

  open(panel: HTMLElement, overlay: HTMLElement, preset: AnimationPresetName): Promise<void> {
    this.cancel();
    if (preset === 'none' || prefersReducedMotion()) {
      panel.style.opacity = '1';
      panel.style.transform = 'none';
      overlay.style.opacity = '1';
      return Promise.resolve();
    }
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
    const kf = this.getOpenKeyframes(preset);
    const panelControls = animate(panel, kf as never, MODAL_OPEN_SPRING as never);
    const overlayControls = animate(overlay, { opacity: [0, 1] } as never, { duration: 0.25, ease: 'easeOut' } as never);
    this.current = panelControls;
    return Promise.all([panelControls.finished, overlayControls.finished])
      .then(() => { panel.style.transition = ''; overlay.style.transition = ''; })
      .catch(() => { panel.style.transition = ''; overlay.style.transition = ''; });
  }

  close(panel: HTMLElement, overlay: HTMLElement, preset: AnimationPresetName): Promise<void> {
    this.cancel();
    if (preset === 'none' || prefersReducedMotion()) {
      panel.style.opacity = '0';
      overlay.style.opacity = '0';
      return Promise.resolve();
    }
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
    const kf = this.getCloseKeyframes(preset);
    const panelControls = animate(panel, kf as never, { duration: MODAL_CLOSE_DURATION, ease: [0.4, 0, 1, 1] } as never);
    const overlayControls = animate(overlay, { opacity: [1, 0] } as never, { duration: MODAL_CLOSE_DURATION, ease: 'easeIn' } as never);
    this.current = panelControls;
    return Promise.all([panelControls.finished, overlayControls.finished])
      .then(() => { panel.style.transition = ''; overlay.style.transition = ''; })
      .catch(() => { panel.style.transition = ''; overlay.style.transition = ''; });
  }

  cancel(): void {
    if (this.current) { try { this.current.cancel(); } catch { /* done */ } this.current = null; }
  }

  destroy(): void { this.cancel(); }

  private getOpenKeyframes(preset: AnimationPresetName): Keyframes {
    switch (preset) {
      case 'fade': return { opacity: [0, 1] };
      case 'scale': return { opacity: [0, 1], scale: [0.92, 1] };
      case 'scale-blur': return { opacity: [0, 1], scale: [0.92, 1], filter: ['blur(8px)', 'blur(0px)'] };
      case 'slide-up': return { opacity: [0, 1], y: [12, 0] };
      case 'slide-left': return { opacity: [0, 1], x: [24, 0] };
      case 'implode': return { opacity: [0, 1], scale: [0, 1], filter: ['blur(16px)', 'blur(0px)'] };
      default: return { opacity: [0, 1], scale: [0.92, 1] };
    }
  }

  private getCloseKeyframes(preset: AnimationPresetName): Keyframes {
    switch (preset) {
      case 'fade': return { opacity: [1, 0] };
      case 'scale': return { opacity: [1, 0], scale: [1, 0.94] };
      case 'scale-blur': return { opacity: [1, 0], scale: [1, 0.94], filter: ['blur(0px)', 'blur(8px)'] };
      case 'slide-up': return { opacity: [1, 0], y: [0, 12] };
      case 'slide-left': return { opacity: [1, 0], x: [0, 24] };
      case 'implode': return { opacity: [1, 0], scale: [1, 0], filter: ['blur(0px)', 'blur(16px)'] };
      default: return { opacity: [1, 0], scale: [1, 0.94] };
    }
  }
}

// ---------------------------------------------------------------------------
// BottomsheetMotionAnimator
// ---------------------------------------------------------------------------

export class BottomsheetMotionAnimator {
  private current: AnimationPlaybackControls | null = null;

  open(panel: HTMLElement, overlay: HTMLElement): Promise<void> {
    this.cancel();
    if (prefersReducedMotion()) {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
      overlay.style.opacity = '1';
      return Promise.resolve();
    }
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
    const panelControls = animate(panel, { transform: ['translateY(100%)', 'translateY(0%)'] } as never, BOTTOMSHEET_OPEN_SPRING as never);
    const overlayControls = animate(overlay, { opacity: [0, 1] } as never, { duration: 0.3, ease: 'easeOut' } as never);
    this.current = panelControls;
    return Promise.all([panelControls.finished, overlayControls.finished])
      .then(() => { panel.style.transition = ''; overlay.style.transition = ''; })
      .catch(() => { panel.style.transition = ''; overlay.style.transition = ''; });
  }

  close(panel: HTMLElement, overlay: HTMLElement, fromY?: number, velocity?: number): Promise<void> {
    this.cancel();
    if (prefersReducedMotion()) {
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(100%)';
      overlay.style.opacity = '0';
      return Promise.resolve();
    }
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
    const endY = panel.offsetHeight + 100;
    const startY = fromY ?? 0;
    const useSpring = velocity !== undefined && Math.abs(velocity) > 0.1;
    const opts: AnimOptions = useSpring
      ? { ...DISMISS_SPRING, velocity: velocity! * 1000 }
      : { duration: BOTTOMSHEET_CLOSE_DURATION, ease: 'easeIn' };
    const panelControls = animate(panel, { transform: [`translateY(${startY}px)`, `translateY(${endY}px)`] } as never, opts as never);
    const overlayStart = parseFloat(getComputedStyle(overlay).opacity) || 1;
    const overlayControls = animate(overlay, { opacity: [overlayStart, 0] } as never, { duration: BOTTOMSHEET_CLOSE_DURATION, ease: 'easeIn' } as never);
    this.current = panelControls;
    return Promise.all([panelControls.finished, overlayControls.finished])
      .then(() => { panel.style.transition = ''; overlay.style.transition = ''; })
      .catch(() => { panel.style.transition = ''; overlay.style.transition = ''; });
  }

  snapBack(panel: HTMLElement, overlay: HTMLElement, fromY: number, velocity?: number): Promise<void> {
    this.cancel();
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
    const opts: AnimOptions = velocity !== undefined && Math.abs(velocity) > 0.1
      ? { ...SNAP_BACK_SPRING, velocity: velocity * 1000 }
      : SNAP_BACK_SPRING;
    const panelControls = animate(panel, { transform: [`translateY(${fromY}px)`, 'translateY(0px)'] } as never, opts as never);
    const overlayStart = parseFloat(getComputedStyle(overlay).opacity) || 0.5;
    const overlayControls = animate(overlay, { opacity: [overlayStart, 1] } as never, { duration: 0.3, ease: 'easeOut' } as never);
    this.current = panelControls;
    return Promise.all([panelControls.finished, overlayControls.finished])
      .then(() => { panel.style.transition = ''; overlay.style.transition = ''; })
      .catch(() => { panel.style.transition = ''; overlay.style.transition = ''; });
  }

  setDragTransform(panel: HTMLElement, overlay: HTMLElement, y: number, sheetHeight: number): void {
    this.cancel();
    panel.style.transition = 'none';
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    const progress = Math.min(1, Math.max(0, y / sheetHeight));
    overlay.style.opacity = String(Math.min(1, Math.max(0, 1 - progress * 0.7)));
  }

  cancel(): void {
    if (this.current) { try { this.current.cancel(); } catch { /* done */ } this.current = null; }
  }

  destroy(): void { this.cancel(); }
}
