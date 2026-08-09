/**
 * BottomsheetMotionDragController — drag-to-dismiss gesture using Motion.
 *
 * Uses native Pointer Events for drag tracking (safest inside Shadow DOM)
 * and Motion's spring animations for snap-back and dismissal.
 *
 * Key design decisions (learned from studying PlainSheet + motion.dev):
 *
 * 1. Native pointer events (pointerdown/pointermove/pointerup) — works in
 *    Shadow DOM, no touch-action hacks needed, handles both touch and mouse.
 * 2. Motion's `animate()` for spring physics — no hand-rolled spring engine.
 * 3. Rubber-band resistance for upward drag (35% of pointer distance).
 * 4. Velocity-aware dismissal (flick down to close).
 * 5. Drag only initiates from handle/header/footer (not body content).
 * 6. requestAnimationFrame batching for smooth 60fps drag tracking.
 * 7. setPointerCapture for reliable tracking outside panel bounds.
 */

import { BottomsheetMotionAnimator } from './motion-animator.js';

export interface DragControllerOptions {
  /** Called when the user dismisses the sheet via drag. */
  onDismiss: () => void;
  /** The animator to use for snap-back and dismissal animations. */
  animator: BottomsheetMotionAnimator;
}

export class BottomsheetMotionDragController {
  private panel: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private animator: BottomsheetMotionAnimator;
  private onDismiss: () => void;
  private destroyed = false;

  // Drag state
  private dragging = false;
  private startY = 0;
  private currentY = 0;
  private lastY = 0;
  private lastTime = 0;
  private velocity = 0; // px/ms
  private sheetHeight = 0;
  private rafId = 0;
  private pendingY = 0;

  constructor(opts: DragControllerOptions) {
    this.animator = opts.animator;
    this.onDismiss = opts.onDismiss;
  }

  /**
   * Attaches drag listeners to the given root (ShadowRoot for event delegation).
   * The panel and overlay are queried dynamically on each drag start.
   */
  attach(root: ShadowRoot): void {
    this.root = root;
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Detaches all listeners. */
  detach(): void {
    if (this.root) {
      this.root.removeEventListener('pointerdown', this.onPointerDown);
      this.root.removeEventListener('pointermove', this.onPointerMove);
      this.root.removeEventListener('pointerup', this.onPointerUp);
      this.root.removeEventListener('pointercancel', this.onPointerUp);
    }
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Permanently destroys the controller. */
  destroy(): void {
    this.detach();
    this.destroyed = true;
    this.panel = null;
    this.overlay = null;
    this.root = null;
  }

  // -----------------------------------------------------------------------
  // Pointer event handlers
  // -----------------------------------------------------------------------

  private onPointerDown = (e: Event) => {
    if (this.destroyed) return;
    const pe = e as PointerEvent;

    // Only respond to primary button (touch or left-click)
    if (pe.button !== 0 && pe.pointerType === 'mouse') return;

    const target = pe.target as HTMLElement | null;

    // Don't start drag on interactive elements
    if (target?.closest('button, a, [data-action], input, select, textarea, [contenteditable="true"]')) return;

    // Only start dragging from the drag handle, header, footer, or
    // full-screen loading/error views — NOT from the body content
    const isInDragZone = target?.closest('.drag-handle, .header, .footer, .connecting-view, .signing-view, .error-state');
    if (!isInDragZone) return;

    // Get the current panel + overlay (they may have been replaced by a re-render)
    this.panel = this.root?.querySelector<HTMLElement>('.panel') ?? null;
    this.overlay = this.root?.querySelector<HTMLElement>('.overlay') ?? null;
    if (!this.panel) return;

    this.dragging = true;
    this.startY = pe.clientY;
    this.lastY = pe.clientY;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.sheetHeight = this.panel.offsetHeight;
    this.currentY = 0;

    // Set pointer capture so pointermove/pointerup fire even outside the panel
    try { this.panel.setPointerCapture(pe.pointerId); } catch { /* may fail */ }

    // Cancel any in-flight animation
    this.animator.cancel();
    cancelAnimationFrame(this.rafId);
  };

  private onPointerMove = (e: Event) => {
    if (!this.dragging || !this.panel) return;
    const pe = e as PointerEvent;

    const dy = pe.clientY - this.startY;

    // Clamp at 0 — when the sheet is fully open, it cannot go up.
    // No rubber-band, no bounce. Only downward drag moves the sheet.
    this.currentY = Math.max(0, dy);
    this.pendingY = this.currentY;

    // Track velocity (px/ms)
    const now = performance.now();
    const dt = now - this.lastTime;
    if (dt > 0) {
      this.velocity = (pe.clientY - this.lastY) / dt;
      this.lastY = pe.clientY;
      this.lastTime = now;
    }

    // Batch transform updates via requestAnimationFrame for smooth 60fps
    if (this.rafId === 0) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        if (this.panel && this.overlay && this.dragging) {
          this.animator.setDragTransform(this.panel, this.overlay, this.pendingY, this.sheetHeight);
        }
      });
    }
  };

  private onPointerUp = (e: Event) => {
    if (!this.dragging) return;
    this.dragging = false;

    const pe = e as PointerEvent;
    if (this.panel) {
      try { this.panel.releasePointerCapture(pe.pointerId); } catch { /* already released */ }
    }

    // Ensure final position is applied
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    if (!this.panel || !this.overlay) return;

    // Dismissal logic:
    // - Fast downward flick (velocity > 0.5 px/ms) → dismiss
    // - Dragged past 40% of sheet height → dismiss
    // - Upward flick does NOT dismiss (user is pulling up to see more)
    const shouldDismiss = this.velocity > 0.5 || this.currentY > this.sheetHeight * 0.4;

    // Haptic feedback on dismiss (Android only)
    if (shouldDismiss && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }

    if (shouldDismiss) {
      // Animate offscreen + call onDismiss
      this.animator.close(this.panel, this.overlay, this.currentY, this.velocity)
        .then(() => {
          this.onDismiss();
          this.currentY = 0;
        })
        .catch(() => {
          this.onDismiss();
          this.currentY = 0;
        });
    } else {
      // Spring back to open position
      this.animator.snapBack(this.panel, this.overlay, this.currentY, this.velocity)
        .then(() => { this.currentY = 0; })
        .catch(() => { this.currentY = 0; });
    }
  };
}
