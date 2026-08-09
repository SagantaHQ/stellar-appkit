/**
 * Shared prop types for the framework-native `<StellarAppKitModal>` components
 * (React, Vue, Solid, Svelte). Each framework's wrapper imports these so the
 * API surface is identical across wrappers — only the implementation language
 * differs.
 *
 * These props mirror the underlying `<saganta-appkit-modal>` Web Component's
 * observed attributes (`mode`, `theme`, `branding`, `logo-src`, `title`,
 * `auto-retry-network`, `stellar-expert-avatars`) and its `client` property.
 *
 * Design note: we don't accept the `client` as a prop here — the framework
 * modal components are designed to be used inside the corresponding provider
 * (`<StellarAppKitProvider>` for React/Solid, `provideStellarAppKit()` for
 * Vue, `setStellarAppKitContext()` for Svelte), which already owns the
 * client. If you need to use the modal without a provider, use the raw
 * Web Component directly with `modal.client = appkit`.
 */
/**
 * Translate the camelCase props to the kebab-case attribute names the Web
 * Component expects. Used by all four framework components.
 */
export function propsToAttributes(props) {
    const attrs = {};
    if (props.mode)
        attrs['mode'] = props.mode;
    if (props.theme)
        attrs['theme'] = props.theme;
    if (props.branding)
        attrs['branding'] = props.branding;
    if (props.logoSrc)
        attrs['logo-src'] = props.logoSrc;
    if (props.title)
        attrs['title'] = props.title;
    if (props.autoRetryNetwork !== undefined)
        attrs['auto-retry-network'] = props.autoRetryNetwork ? 'true' : 'false';
    if (props.stellarExpertAvatars !== undefined)
        attrs['stellar-expert-avatars'] = props.stellarExpertAvatars ? 'true' : 'false';
    return attrs;
}
//# sourceMappingURL=modal-props.js.map