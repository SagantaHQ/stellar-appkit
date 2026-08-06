/** Minimal typed event emitter — no Node `events` dependency, works identically on web and RN. */
export declare class TypedEmitter<Events extends object> {
    private listeners;
    on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void;
    off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void;
    emit<K extends keyof Events>(event: K, payload: Events[K]): void;
    removeAllListeners(): void;
}
//# sourceMappingURL=events.d.ts.map