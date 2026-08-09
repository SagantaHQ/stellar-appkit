/**
 * SolidJS component wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which Solid can
 * render as a custom element, but a typed Solid component feels more
 * idiomatic. This wrapper handles `client` assignment, prop-to-attribute
 * forwarding, event listening, and exposes an imperative `open()` / `close()`
 * API via Solid refs.
 *
 * Usage:
 *
 * ```tsx
 * import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit/solid';
 * import { createSignal } from 'solid-js';
 *
 * function App() {
 *   return (
 *     <StellarAppKitProvider config={...}>
 *       <StellarAppKitModal mode="auto" theme="dark" />
 *       <ConnectButton />
 *     </StellarAppKitProvider>
 *   );
 * }
 *
 * function ConnectButton() {
 *   let modal: { open: () => void } | undefined;
 *   return <button onClick={() => modal?.open()}>Connect</button>;
 * }
 * ```
 *
 * The modal reads its `client` from the same context as the hooks — so it
 * stays in sync with `<StellarAppKitProvider>`. If you want to use it
 * without a provider, use the raw `<saganta-appkit-modal>` element and
 * set `element.client = appkit` directly.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */
import { type JSX, type Component } from 'solid-js';
import { type StellarAppKitModalProps, type StellarAppKitModalHandle, type StellarAppKitModalEvents } from '../ui-web/modal-props.js';
import type { ConnectSession, ConnectError } from '../index.js';
export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };
export interface StellarAppKitModalComponentProps extends StellarAppKitModalProps, StellarAppKitModalEvents {
    /** Optional children — rendered inside the modal host (rarely needed). */
    children?: JSX.Element;
    /** CSS class name applied to the host element. */
    class?: string;
    /** Inline style applied to the host element (for theme overrides via CSS vars). */
    style?: JSX.CSSProperties;
    /** Called with the imperative handle once the host element mounts. */
    ref?: (handle: StellarAppKitModalHandle) => void;
}
/**
 * `<StellarAppKitModal>` — a Solid component wrapping the underlying
 * `<saganta-appkit-modal>` Web Component.
 *
 * The component:
 * 1. Reads the `StellarAppKit` client from context (via `useAppKit()`).
 * 2. Sets `element.client = client` after mount, so the modal wires up its
 *    internal event listeners and preview handler.
 * 3. Forwards all `StellarAppKitModalProps` to attributes on the Web Component.
 * 4. Subscribes to the modal's CustomEvents and dispatches them as the
 *    `onConnect`, `onDisconnect`, `onError` callbacks.
 * 5. Calls the `ref` prop with an imperative handle containing `open()` /
 *    `close()` / `element`.
 */
export declare const StellarAppKitModal: Component<StellarAppKitModalComponentProps>;
export default StellarAppKitModal;
export type { ConnectSession, ConnectError };
//# sourceMappingURL=modal.d.ts.map