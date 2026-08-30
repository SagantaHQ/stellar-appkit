/**
 * Clipboard access for React Native with zero extra dependencies.
 *
 * The web modal copies via `navigator.clipboard`; React Native has no
 * equivalent in core that isn't deprecated — but the deprecated one
 * (`Clipboard` from react-native core) is still present in every shipping
 * RN release and is the only dependency-free one-tap copy on the platform.
 *
 * `copyText()` therefore tries, in order:
 *
 *   1. core `Clipboard.setString` — one tap, no share-sheet detour;
 *   2. the share sheet (`Share.share`) — offers Copy on both platforms;
 *   3. nothing — never rejects; the text stays on screen either way.
 *
 * The core module is reached through an optional structural cast so this
 * compiles (and gracefully skips to the share sheet) even against future
 * RN type declarations that dropped the deprecated export.
 */

import { Share } from 'react-native';
import * as ReactNative from 'react-native';

/**
 * Reads RN core's (deprecated but universal) Clipboard lazily, per call:
 * capturing it at module scope would evaluate the deprecated getter — and
 * its one-time console warning — for every app that imports the modal,
 * clipboard or not, and would pin whatever the module export table held at
 * import time. Optional-chain access keeps this a no-op on runtimes where
 * the export is gone.
 */
function coreClipboard(): { setString?: (text: string) => void } | undefined {
  return (ReactNative as unknown as { Clipboard?: { setString?: (text: string) => void } }).Clipboard;
}

/** How the copy landed — callers can adapt their feedback. */
export type CopyOutcome = 'clipboard' | 'share' | 'failed';

/** Copies `text` — one-tap core clipboard, share-sheet fallback, never rejects. */
export async function copyText(text: string): Promise<CopyOutcome> {
  const clipboard = coreClipboard();
  if (clipboard?.setString) {
    try {
      clipboard.setString(text);
      return 'clipboard';
    } catch {
      // Fall through to the share sheet.
    }
  }
  try {
    await Share.share({ message: text });
    return 'share';
  } catch {
    // User dismissed the sheet / no sheet available — the text is still
    // on screen; the caller's copy affordance already gave its feedback.
    return 'failed';
  }
}
