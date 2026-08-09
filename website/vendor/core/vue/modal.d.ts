/**
 * Vue 3 component wrapper for the `<saganta-appkit-modal>` Web Component.
 *
 * Why this exists: the underlying modal is a Web Component, which Vue can
 * render via the `v-is` syntax or as a custom element (configured in the
 * compiler), but a typed SFC-style component feels more idiomatic. This
 * wrapper handles `client` assignment, prop-to-attribute forwarding, event
 * listening, and exposes an imperative `open()` / `close()` API via
 * template refs.
 *
 * Usage:
 *
 * ```vue
 * <script setup lang="ts">
 *   import { StellarAppKitModal } from '@saganta/stellar-appkit/vue';
 *   import { provideStellarAppKit } from '@saganta/stellar-appkit/vue';
 *   import { ref } from 'vue';
 *
 *   provideStellarAppKit({ network: 'TESTNET', connectors: [...] });
 *   const modal = ref<InstanceType<typeof StellarAppKitModal>>();
 *
 *   function open() { modal.value?.open(); }
 * </script>
 *
 * <template>
 *   <StellarAppKitModal ref="modal" mode="auto" theme="dark" />
 *   <button @click="open">Connect</button>
 * </template>
 * ```
 *
 * The modal reads its `client` from the same `APPKIT_INJECTION_KEY` as the
 * composables — so it stays in sync with `provideStellarAppKit()` or
 * `app.use(StellarAppKitPlugin, ...)`. If you want to use it without a
 * provider, use the raw `<saganta-appkit-modal>` element and set
 * `element.client = appkit` directly.
 *
 * The underlying Web Component is imported as a side-effect of importing
 * this module — so the custom element is registered before any modal mounts.
 */
import { type PropType } from 'vue';
import { type StellarAppKitModalProps, type StellarAppKitModalHandle, type StellarAppKitModalEvents } from '../ui-web/modal-props.js';
import type { ConnectSession, ConnectError } from '../index.js';
export type { StellarAppKitModalProps, StellarAppKitModalHandle, StellarAppKitModalEvents };
/**
 * Vue component wrapping `<saganta-appkit-modal>`.
 *
 * All props are reactive — changes propagate to the underlying Web Component
 * via attribute updates. Events (`sc-connect`, `sc-disconnect`, `sc-error`)
 * are forwarded as Vue emits (`connect`, `disconnect`, `error`) so they can
 * be listened to with `@connect="..."` in the template.
 */
export declare const StellarAppKitModal: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    mode: {
        type: PropType<StellarAppKitModalProps['mode']>;
        default: undefined;
    };
    theme: {
        type: PropType<StellarAppKitModalProps['theme']>;
        default: undefined;
    };
    branding: {
        type: PropType<StellarAppKitModalProps['branding']>;
        default: undefined;
    };
    logoSrc: {
        type: PropType<StellarAppKitModalProps['logoSrc']>;
        default: undefined;
    };
    title: {
        type: PropType<StellarAppKitModalProps['title']>;
        default: undefined;
    };
    autoRetryNetwork: {
        type: PropType<StellarAppKitModalProps['autoRetryNetwork']>;
        default: undefined;
    };
    stellarExpertAvatars: {
        type: PropType<StellarAppKitModalProps['stellarExpertAvatars']>;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    connect: (_session: ConnectSession) => true;
    disconnect: (_payload: {
        walletId: string;
    }) => true;
    error: (_error: ConnectError) => true;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    mode: {
        type: PropType<StellarAppKitModalProps['mode']>;
        default: undefined;
    };
    theme: {
        type: PropType<StellarAppKitModalProps['theme']>;
        default: undefined;
    };
    branding: {
        type: PropType<StellarAppKitModalProps['branding']>;
        default: undefined;
    };
    logoSrc: {
        type: PropType<StellarAppKitModalProps['logoSrc']>;
        default: undefined;
    };
    title: {
        type: PropType<StellarAppKitModalProps['title']>;
        default: undefined;
    };
    autoRetryNetwork: {
        type: PropType<StellarAppKitModalProps['autoRetryNetwork']>;
        default: undefined;
    };
    stellarExpertAvatars: {
        type: PropType<StellarAppKitModalProps['stellarExpertAvatars']>;
        default: undefined;
    };
}>> & Readonly<{
    onConnect?: ((_session: ConnectSession) => any) | undefined;
    onDisconnect?: ((_payload: {
        walletId: string;
    }) => any) | undefined;
    onError?: ((_error: ConnectError) => any) | undefined;
}>, {
    mode: import("../ui-web/modal-props.js").ModalMode | undefined;
    theme: import("../ui-web/modal-props.js").ModalTheme | undefined;
    branding: import("../ui-web/modal-props.js").ModalBranding | undefined;
    logoSrc: string | undefined;
    title: string | undefined;
    autoRetryNetwork: boolean | undefined;
    stellarExpertAvatars: boolean | undefined;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export default StellarAppKitModal;
//# sourceMappingURL=modal.d.ts.map