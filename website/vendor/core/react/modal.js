import { jsx as _jsx } from "react/jsx-runtime";
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
import { forwardRef, useEffect, useImperativeHandle, useRef, } from 'react';
import { useAppKit } from './index.js';
import { propsToAttributes, } from '../ui-web/modal-props.js';
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
export const StellarAppKitModal = forwardRef(function StellarAppKitModal(props, ref) {
    const client = useAppKit();
    const hostRef = useRef(null);
    // Wire up the client to the host element whenever it changes.
    useEffect(() => {
        const el = hostRef.current;
        if (!el)
            return;
        el.client = client;
    }, [client]);
    // Forward the props to attributes whenever they change. We do this in an
    // effect (rather than JSX attribute spreading) because React doesn't know
    // how to update Web Component custom attributes reliably across versions
    // — setting them imperatively is the most predictable approach.
    useEffect(() => {
        const el = hostRef.current;
        if (!el)
            return;
        const attrs = propsToAttributes(props);
        for (const [name, value] of Object.entries(attrs)) {
            el.setAttribute(name, value);
        }
    }, [
        props.mode,
        props.theme,
        props.branding,
        props.logoSrc,
        props.title,
        props.autoRetryNetwork,
        props.stellarExpertAvatars,
    ]);
    // Wire up event listeners. We use CustomEvent capture here because the
    // underlying modal dispatches composed/bubbling events.
    useEffect(() => {
        const el = hostRef.current;
        if (!el)
            return;
        const unsubscribe = [];
        if (props.onConnect) {
            const handler = (e) => props.onConnect?.(e.detail);
            el.addEventListener('sc-connect', handler);
            unsubscribe.push(() => el.removeEventListener('sc-connect', handler));
        }
        if (props.onDisconnect) {
            const handler = (e) => props.onDisconnect?.(e.detail);
            el.addEventListener('sc-disconnect', handler);
            unsubscribe.push(() => el.removeEventListener('sc-disconnect', handler));
        }
        if (props.onError) {
            const handler = (e) => props.onError?.(e.detail);
            el.addEventListener('sc-error', handler);
            unsubscribe.push(() => el.removeEventListener('sc-error', handler));
        }
        return () => unsubscribe.forEach((u) => u());
    }, [props.onConnect, props.onDisconnect, props.onError]);
    // Expose the imperative handle: open()/close()/element.
    useImperativeHandle(ref, () => ({
        open: async () => {
            await hostRef.current?.open?.();
        },
        close: () => {
            hostRef.current?.close?.();
        },
        get element() {
            return hostRef.current;
        },
    }), []);
    // JSX doesn't natively know how to render Web Components with TypeScript.
    // We use a lowercase tag name (which React treats as a custom element) and
    // cast the props. The `ref` lets us access the underlying DOM node.
    const HostTag = 'saganta-appkit-modal';
    return (_jsx(HostTag, { ref: hostRef, className: props.className, style: props.style, children: props.children }));
});
// Re-exported above — keep these out of the `React` namespace so they're
// tree-shakeable independently of the component.
export { StellarAppKitModal as default };
//# sourceMappingURL=modal.js.map