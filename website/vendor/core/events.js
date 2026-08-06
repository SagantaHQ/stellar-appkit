/** Minimal typed event emitter — no Node `events` dependency, works identically on web and RN. */
export class TypedEmitter {
    constructor() {
        this.listeners = {};
    }
    on(event, handler) {
        const set = (this.listeners[event] ??= new Set());
        set.add(handler);
        return () => set.delete(handler);
    }
    off(event, handler) {
        this.listeners[event]?.delete(handler);
    }
    emit(event, payload) {
        this.listeners[event]?.forEach((handler) => handler(payload));
    }
    removeAllListeners() {
        this.listeners = {};
    }
}
//# sourceMappingURL=events.js.map