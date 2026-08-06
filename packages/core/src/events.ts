/** Minimal typed event emitter — no Node `events` dependency, works identically on web and RN. */
export class TypedEmitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(handler);
    return () => set.delete(handler);
  }

  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
    this.listeners[event]?.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((handler) => handler(payload));
  }

  removeAllListeners(): void {
    this.listeners = {};
  }
}
