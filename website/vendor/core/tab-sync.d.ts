/**
 * Cross-tab session sync via BroadcastChannel. Deliberately doesn't try to
 * transfer connector/session objects between tabs — a connector instance
 * is tied to that tab's `window` and injected providers, and can't be
 * serialized. Instead this just pings other tabs "the persisted session
 * set changed, go re-read storage" — each tab keeps its own connector
 * instances and reconciles its in-memory state against the shared
 * localStorage payload when it hears the ping. See client.ts's
 * `resyncFromStorage()` for the reconciliation logic.
 *
 * No-ops gracefully where BroadcastChannel isn't available (older Safari,
 * some RN environments) — cross-tab sync is a nice-to-have, not something
 * that should break the SDK where it's unsupported.
 */
export declare class TabSync {
    private channel;
    constructor(channelName: string, onRemoteChange: () => void);
    /** Call after any local mutation that changes persisted session state (connect, disconnect, switchAccount). */
    notify(): void;
    close(): void;
}
//# sourceMappingURL=tab-sync.d.ts.map