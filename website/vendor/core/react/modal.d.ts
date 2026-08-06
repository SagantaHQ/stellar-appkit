/**
 * React JSX wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which works in
 * any framework but feels unidiomatic in React — you have to manage refs,
 * manually set the `.client` property, and listen for CustomEvents. This
 * component wraps all of that behind a normal JSX component with typed props
 * and an imperative handle (via `ref`).
 *
 * Usage:
 *
 * ```tsx
 * import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit/react';
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
 *   const modalRef = useRef<StellarAppKitModalHandle>(null);
 *   return <button onClick={() => modalRef.current?.open()}>Connect</button>;
 * }
 * ```
 *
 * The modal reads its `client` from the same context as the hooks — so it
 * stays in sync with `<StellarAppKitProvider>`. If you want to use it without
 * a provider, use the raw `<saganta-appkit-modal>` element and set
 * `element.client = appkit` directly.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */
import { type ReactNode } from 'react';
import { type StellarAppKitModalProps, type StellarAppKitModalHandle, type StellarAppKitModalEvents } from '../ui-web/modal-props.js';
export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };
export interface StellarAppKitModalComponentProps extends StellarAppKitModalProps, StellarAppKitModalEvents {
    /** Optional children — rendered inside the modal host (rarely needed). */
    children?: ReactNode;
    /** CSS class name applied to the host element. */
    className?: string;
    /** Inline style applied to the host element (for theme overrides via CSS vars). */
    style?: React.CSSProperties;
}
/**
 * `<StellarAppKitModal>` — a React component wrapping the underlying
 * `<saganta-appkit-modal>` Web Component.
 *
 * The component:
 * 1. Reads the `StellarAppKit` client from context (via `useAppKit()`).
 * 2. Sets `element.client = client` after mount, so the modal wires up its
 *    internal event listeners and preview handler.
 * 3. Forwards all `StellarAppKitModalProps` to attributes on the Web Component.
 * 4. Subscribes to the modal's CustomEvents and dispatches them as the
 *    `onConnect`, `onDisconnect`, `onError` callbacks.
 * 5. Exposes an imperative handle via `ref` with `open()` / `close()` methods.
 */
export declare const StellarAppKitModal: import("react").ForwardRefExoticComponent<StellarAppKitModalComponentProps & import("react").RefAttributes<StellarAppKitModalHandle>>;
export { StellarAppKitModal as default };
//# sourceMappingURL=modal.d.ts.map