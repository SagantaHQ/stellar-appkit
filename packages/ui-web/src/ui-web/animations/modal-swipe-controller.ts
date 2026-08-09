/**
 * ModalSwipeController — swipe-to-close gesture for the desktop modal.
 *
 * Allows the user to swipe in any direction (up, down, left, right) to
 * close the modal. Uses native Pointer Events + Motion for the exit
 * animation.
 *
 * - Swipe up: panel slides up + fades out
 * - Swipe down: panel slides down + fades out
 * - Swipe left: panel slides left + fades out
 * - Swipe right: panel slides right + fades out
 *
 * Only activates on the panel (not the overlay) — clicking the overlay
 * still closes normally. Interactive elements (buttons, links) are
 * excluded so clicks work normally.
 */

import { animate, type AnimationPlaybackControls } from 'motion';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnimOptions = Record<string, any>;

export interface ModalSwipeOptions {
  onDismiss: () => void;
  /** Minimum swipe distance in px to trigger dismiss (default: 100). */
  threshold?: number;
  /** Minimum swipe velocity in px/ms to trigger dismiss (default: 0.5). */
  velocityThreshold?: number;
}

export class ModalSwipeController {
  private root: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private onDismiss: () => void;
  private threshold: number;
  private velocityThreshold: number;
  private destroyed = false;

  // Swipe state
  private swiping = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private velocityX = 0;
  private velocityY = 0;
  private rafId = 0;
  private currentAnimation: AnimationPlaybackControls | null = null;

  constructor(opts: ModalSwipeOptions) {
    this.onDismiss = opts.onDismiss;
    this.threshold = opts.threshold ?? 100;
    this.velocityThreshold = opts.velocityThreshold ?? 0.5;
  }

  attach(root: ShadowRoot): void {
    this.root = root;
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerUp);
  }

  detach(): void {
    if (this.root) {
      this.root.removeEventListener('pointerdown', this.onPointerDown);
      this.root.removeEventListener('pointermove', this.onPointerMove);
      this.root.removeEventListener('pointerup', this.onPointerUp);
      this.root.removeEventListener('pointercancel', this.onPointerUp);
    }
    cancelAnimationFrame(this.rafId);
    this.currentAnimation?.cancel();
  }

  destroy(): void {
    this.detach();
    this.destroyed = true;
    this.root = null;
    this.panel = null;
  }

  private onPointerDown = (e: Event) => {
    if (this.destroyed) return;
    const pe = e as PointerEvent;
    if (pe.button !== 0 && pe.pointerType === 'mouse') return;

    const target = pe.target as HTMLElement | null;
    // Don't start swipe on interactive elements
    if (target?.closest('button, a, [data-action], input, select, textarea, [contenteditable="true"]')) return;

    // Only start swipe from the panel (not the overlay)
    const panel = target?.closest('.panel');
    if (!panel) return;

    this.panel = panel as HTMLElement;
    this.swiping = true;
    this.startX = pe.clientX;
    this.startY = pe.clientY;
    this.lastX = pe.clientX;
    this.lastY = pe.clientY;
    this.lastTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;

    try { this.panel.setPointerCapture(pe.pointerId); } catch { /* may fail */ }
    this.currentAnimation?.cancel();
    cancelAnimationFrame(this.rafId);
  };

  private onPointerMove = (e: Event) => {
    if (!this.swiping || !this.panel) return;
    const pe = e as PointerEvent;

    const dx = pe.clientX - this.startX;
    const dy = pe.clientY - this.startY;

    // Track velocity
    const now = performance.now();
    const dt = now - this.lastTime;
    if (dt > 0) {
      this.velocityX = (pe.clientX - this.lastX) / dt;
      this.velocityY = (pe.clientY - this.lastY) / dt;
      this.lastX = pe.clientX;
      this.lastY = pe.clientY;
      this.lastTime = now;
    }

    // Apply transform during swipe (follows finger)
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Only start moving after a minimum threshold to distinguish from a click
    if (absDx < 5 && absDy < 5) return;

    // Determine dominant direction and apply resistance
    const RESISTANCE = 0.5; // 50% resistance so the modal doesn't fly away
    const moveX = absDx > absDy ? dx * RESISTANCE : dx * 0.2;
    const moveY = absDx > absDy ? dy * 0.2 : dy * RESISTANCE;

    // Fade overlay proportionally
    const distance = Math.max(absDx, absDy);
    const fadeProgress = Math.min(1, distance / (this.threshold * 2));
    const opacity = 1 - fadeProgress * 0.5;

    if (this.rafId === 0) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        if (this.panel && this.swiping) {
          this.panel.style.transition = 'none';
          this.panel.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) scale(${1 - fadeProgress * 0.05})`;
          this.panel.style.opacity = String(opacity);
        }
      });
    }
  };

  private onPointerUp = (e: Event) => {
    if (!this.swiping) return;
    this.swiping = false;

    const pe = e as PointerEvent;
    if (this.panel) {
      try { this.panel.releasePointerCapture(pe.pointerId); } catch { /* already released */ }
    }

    cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    if (!this.panel) return;

    const dx = pe.clientX - this.startX;
    const dy = pe.clientY - this.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const maxVel = Math.max(Math.abs(this.velocityX), Math.abs(this.velocityY));
    const maxDist = Math.max(absDx, absDy);

    // Dismiss if past threshold OR fast flick
    const shouldDismiss = maxDist > this.threshold || maxVel > this.velocityThreshold;

    if (shouldDismiss) {
      // Animate offscreen in the dominant direction
      const dir = absDx > absDy ? 'x' : 'y';
      const sign = dir === 'x' ? Math.sign(dx) : Math.sign(dy);
      const offscreenDist = 400;

      const endX = dir === 'x' ? sign * offscreenDist : dx * 0.3;
      const endY = dir === 'y' ? sign * offscreenDist : dy * 0.3;

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }

      this.currentAnimation = animate(
        this.panel,
        {
          transform: [`translate3d(${dx * 0.5}px, ${dy * 0.5}px, 0) scale(0.95)`, `translate3d(${endX}px, ${endY}px, 0) scale(0.9)`],
          opacity: [parseFloat(this.panel.style.opacity) || 0.7, 0],
        } as never,
        { duration: 0.2, ease: 'easeIn' } as never,
      );

      this.currentAnimation.finished.then(() => {
        this.panel = null;
        this.onDismiss();
      }).catch(() => {
        this.panel = null;
        this.onDismiss();
      });
    } else {
      // Spring back to center
      this.currentAnimation = animate(
        this.panel,
        {
          transform: ['translate3d(0, 0, 0) scale(1)'],
          opacity: [parseFloat(this.panel.style.opacity) || 0.8, 1],
        } as never,
        { type: 'spring', stiffness: 400, damping: 35 } as never,
      );

      this.currentAnimation.finished.then(() => {
        if (this.panel) {
          this.panel.style.transition = '';
          this.panel.style.transform = '';
          this.panel.style.opacity = '';
        }
      }).catch(() => {
        if (this.panel) {
          this.panel.style.transition = '';
          this.panel.style.transform = '';
          this.panel.style.opacity = '';
        }
      });
    }
  };
}
