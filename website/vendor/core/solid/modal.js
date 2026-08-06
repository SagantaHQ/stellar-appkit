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
import { createComponent, onCleanup, onMount, splitProps, } from 'solid-js';
import { useAppKit } from './index.js';
import { propsToAttributes, } from '../ui-web/modal-props.js';
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
export const StellarAppKitModal = (props) => {
    const client = useAppKit();
    let hostEl = null;
    // Split out the callback props so we can register/unregister them
    // independently of the attribute-bearing props.
    const [modalProps, eventProps, rest] = splitProps(props, ['mode', 'theme', 'branding', 'logoSrc', 'title', 'autoRetryNetwork', 'stellarExpertAvatars'], ['onConnect', 'onDisconnect', 'onError']);
    onMount(() => {
        if (!hostEl)
            return;
        hostEl.client = client;
        // Apply initial attributes.
        const attrs = propsToAttributes(modalProps);
        for (const [name, value] of Object.entries(attrs)) {
            hostEl.setAttribute(name, value);
        }
        // Wire up event listeners. We always register all three; the handlers
        // no-op if the corresponding callback isn't set.
        const onConnect = (e) => eventProps.onConnect?.(e.detail);
        const onDisconnect = (e) => eventProps.onDisconnect?.(e.detail);
        const onError = (e) => eventProps.onError?.(e.detail);
        hostEl.addEventListener('sc-connect', onConnect);
        hostEl.addEventListener('sc-disconnect', onDisconnect);
        hostEl.addEventListener('sc-error', onError);
        onCleanup(() => {
            hostEl?.removeEventListener('sc-connect', onConnect);
            hostEl?.removeEventListener('sc-disconnect', onDisconnect);
            hostEl?.removeEventListener('sc-error', onError);
        });
        // Expose the imperative handle via the `ref` callback prop.
        props.ref?.({
            open: async () => {
                await hostEl?.open?.();
            },
            close: () => {
                hostEl?.close?.();
            },
            get element() {
                return hostEl;
            },
        });
    });
    // Solid renders unknown lowercase tags as custom elements by default —
    // no special compiler config needed.
    return createComponent(('saganta-appkit-modal'), {
        ref: (el) => {
            hostEl = el;
        },
        class: rest.class,
        style: rest.style,
        children: rest.children,
    });
};
export default StellarAppKitModal;
//# sourceMappingURL=modal.js.map