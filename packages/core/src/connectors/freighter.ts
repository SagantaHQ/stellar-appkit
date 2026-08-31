import type {
  WalletConnector,
  WalletMeta,
  WalletCapabilities,
  ConnectOptions,
  WalletAccount,
  GetAddressResult,
  GetNetworkResult,
  SignTxOptions,
  SignTransactionResult,
  SignOptions,
  SignAuthEntryResult,
  SignMessageResult,
} from '../types.js';
import { ConnectError } from '../types.js';
import { withNormalizedError, unwrapResult } from './error-utils.js';

/**
 * Adapter for the Freighter browser extension via the official
 * `@stellar/freighter-api` package. That package's shape is already close
 * to SEP-43 (getAddress/signTransaction/signMessage/getNetworkDetails), so
 * this adapter is mostly a thin re-mapping rather than a shim.
 *
 * `@stellar/freighter-api` is a bundled dependency (listed in
 * `dependencies` in packages/core/package.json) — it's installed
 * automatically when you `npm install @saganta/stellar-appkit`, and
 * lazy-imported here so it's only loaded when the Freighter connector
 * is actually used (tree-shaken out otherwise).
 */
export function createFreighterConnector(): WalletConnector {
  const meta: WalletMeta = {
    id: 'freighter',
    name: 'Freighter',
    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAADAFBMVEVlS9hPPLD////9/v7///7+/f9lTNZPPLL///2Qft9mTdlOPbBVQLxTP7f9//9RPbRPPa5dRsr///thSdKEcdhwXc1QPLNiSdT//v1jS9VaRMZQPK/+//yQft52Y89XQ8FTPrRRPLD9/f2SgOCCb9h7ZtNSP7FPPLFzXs5oT9pgSdBUQLn8+/5kSthgSM9PPrFNOqz39fx0YM2Ne96BbdVXQb2YhuNmS9h6aNP6+P708vt9aNRcR8xYRMRXQr9fRs1aRchaQ8NUPrlOPbL//v+QfuJxXcucieWJd9xqUtp5ZtNeSM6VheNjTNhgSM1vWstqUth4Y9F5ZdBVQb5RPq5LOKn+//+hkeiZiOOHdNl3Y9J+a9Z0YM9tWsjY0+5YONV6aM9cRMhZQsFOPa2aiud8a9NjS9NnU8BUQ6+Ug+FkStZ5ZdV+bNNOOq7//v7s6fR1YNFxXdBXRbOgkeSSgOKTgeB7aNZjTdZaR7dRPbb/+//+//7v6/nj3/KllemTgt5KGdJdSbrn4/TDvOiXheaejeWzquSLd+GUhd2EcdyGdNPGvuuRfeCGdNuAbdpzXdVkTMtqVsXx7fzq5vfSzO2RgtiJetZOOrGcjOqNfOCYid6NfdpbPNRuWdHw7vjKxOq9s+qjk+aonOScjt+RgN19aNhfQthoUNRRKtRqU9FoU8xKN6b8/vnj3vfPy+eXiOaPfOaTguWFcuRlS91UMdiajtdmUsVXQrdWQrROPrRHMq3d2POto99lS9qNfNaNf9R+a9BCJbBLNq9OO6kkAKjt6feUguu1quq3sN1sVdqxqthXN9hNItWVitOhmMxhTb5hULpLM7RbS7AuAaje2u2toeW+tuOnnduXitp3YtY2BK9FLqzOxu+pme6aiu2il96nn9ZgSMZLO7H//f/a0/XFwN6CctBRLcx4ZslzYcZuW8FiUbXUzfPHvvKeje5/auVbPcuVjMhqXbgNAKHFuPWwoexhSMuAdL52a7hdQtKCdMpGGcZQMsI1Fqo9AMuHf7sg9HKzAAATbUlEQVR42u2bB1RTVxjHyctLCDMQAkTCTEhYAcI0AUVli8gyDNnKXjIEBBUUUGTIKktBcIvgqqNuW3etraNa96p2773nd98LpZ6aFvA0np7TP2Qc9eT73fvNe3NU2TtzAZ0+0V5FZeJElZkzVSaqKFszAQBsEwAq9gCibC1YMHMmmEW2gQC9V7LSF6gcQ+Zh+5ET4EXJWkBHK7eX21W+C5DzQQDwzERkgMqzFJGCzw7h2a8f8u8ZC+X+MxSZ+89Uz9wF/+t//a//9Z/Qs+vXIPXp09WhZ6qHTR+gqyhfA2FbXluaFPbKK/T3lu5TD1N235oYtmZp3NGOHYv7+/PfqLnww2sLbI6pKE/2NseWunQ4MXBMruqja14dnKCiLNlPf5W+VoSztvN4VBqNSqXSGNiOrvfClLQHYH/rS+0YzjPmMDBtWL62NmbMw6Qb3wtTTizah2296cQS0TAQzqFipKhAkBR2TF1d5V8W2E/qlWLbYdkYjYYzcJxKMtAwD5c1NkoAUN/S8hxG1Y7SjuJgmNTDQwr7gHbDV4S9/X763n8fYPprHRg1SlubhuPV19fvCp5fewTDSH+Iaj8zVP+rbGxspk+fHhYGT6+A4AX+cNygYfseYBxtsM8SNS5ZXby7ePWe+lopIoDH22cbbMGe3OJ09GRjo26/ZcuaV/ft2/oaaOnS17Zu3XrsKVxlk1SBURdpU3Fp7YrUgJ7gurqs3XtqaUQUsDw23t/jsAXsJSUl7dsHlvYlrdlyrCWI3dt588G12pdfXre2oyPxSGNYts14AWxe3bRwHiQeFasxWZ4aE+MenFVSvMxyJ84BAmNWzfP364PYDV2dNzeu33Ctdt0nH3/89o7nnKQ0X+Qiwk8MFmth5xybveP1wNJGjIeB/YrgT1NTY9zdg4ODdy/zW+7EQpvA8MhfDGEpFYHBYeHyckmjcoyNeUi404stA3vHGQc2a6px46goGrZuV/Sq5QEBy0C7/fyaE8k4RBAMjFQUDUokmOVQh3FwEAoVpy5B6YAKIIwnB295sKiwAR6V0fOXA8CuZcWBlpZNt65jVMIEFQzKzY0APf4eAHojXCUD4wN41YXHQhHQvjx6PhCkpro0zK7fHP7wIgAoFM7hcDC5qFA7nRoi0uJyBlTU7bPHHoN1HACgYe3z10dHRy9fpcaebdl2oOj2FyQA7PqIaMM2WehJHgnwK6pJOO7pmRsxuNfecMIEOmgcAGeiKxGBe0NgblWeedntN5EFnIU9Jupwl6h4ox9bRNjHnc5d6Nr/QYQACIIG9PQMDccIkNS1kAFlEJO+XFlZGR3dO7u+LE/ILTq9ExNhGIflUVFxJLFj7dqa6+fOX/fAyfLUf6Et44MjBA6O3/h5/5C/v3NsTqmna4uug54h2oKxBGGsB0ZDpj6O3lBZGdAQ2NZtbpF5+EsnbbQDogeS3NLYlr6+lpbC+IdvosyHlR9tPX586MJbBMzi2HBn/4RQf+vYHEHcLd0QW4JgLEHweTXG88Xm4U61lffuuXexD3gzhVe+IjaAhlV3uQQGBs4Gsdlsy+NniNwU3bwVl+z/rhNGg5/8oNgC/dDQUP/42JzNLUZTHGxt9dLT6aAxFCIq5usLa6mNvrfxxfcNvMpkX53HqFTk7OvsTS5gn21JqACKNlr2CzmuAuthAEFOeDwQJPjHh5e2zNWd4TDDVk9v9G6AIOhcqK0dhaFSUFO5bEXCyROnD7+DRWkvYnCw5zpN1Fb2IgKEUB9eLQcIcj1u2jC8A5JkU+SEUP34nMK5c6ZOmjTD1nYsbrB5D4UT0Q1822vmv//Rd+faMZRxuDF2val45UoTl8DHAUQvpLFdJV0jABFAAAAFt/bPNZqMCGagQBh9HrwkAgeghkwjBhJ4phrjyAGJDXy/lSvV1AgvNNU3CSr+AGDHDQMIBAJJhKl1Yd/+/Zc0vczMCAIHW71Rx8GxsK0vwywWFUWMZESe03AWi8HDqjtNNiEAIJjdHBcX1yyPASkB0DsMUCqQSIJiC6vKtcrdNGd5AYHuJIjF0ccBfW9SI8biyXsLlQpPDAbHGGu/sJqvttLExAQIkquqysqqTrwxApD70rALkpOTJUGlbdwDB9zcNDVnzfKabKSrCwSjjgMgWNP4FgvCHmcxGAwcHsY8HNtRt6JYzY8EcMkwsCtnHrj9htwFkhGA9lICIC5DfMDOzk4T5GZGEISMPg7o6sfWfHMGplCqMYdjTNR8yIjA1Xy0dniYFLtmmntrmSMA1I9FL3jOZrt2SjEq/CwO8vSUSCSbM8Tm5ebmWt5AMAsI5sAeQBwsAI2qHqr/4NKYD12XQU4bHnd79vhtgrWTcvnwlFCVKTx4uwIj/vYlSwjKhnxA9pWeC/UEIQDmIVWmAbMcMXjNNSLcAASjdMNEetiKm+d37oDxZ3FFR21dvUmWn5+a2kpk3oR/XGYh1HAUZv5yfnF7dcWRG6aubPZs184ND1648OP++HCBwFOwOeOUo5WGj4+BlWq5Hbhh7jTYhEkz9EYdB+rZr5wtCVyxO6anLrB+j18d3w8AVq4kCGZ/FGng6Kjh6HjoRFuac+FQX2kaEDTV97W2tg7F6/ubCgAh45QFRUPjUTfFyqBcS4sgmAolyTCbPnGUBHvpfqt2uWdllWTtLgarsH4yAfxcPtyWp6qqoQHrk6Uk5KblpkkkcZawB8kfxTvr6+v7O4dHCOIyIq1UdbgUKwrFSlWV6e3m5mU2TAAa3R4MPJ/a457F56PVywFg/8H+qUc+PlawPi6Fwk0olUg8BYI4GNtMIy8V6hcW+odahwchACuuDoUUEHi7QSxOhdYw+vasbp8eGIC2oITPV1ODBwIA+6dOPXqkASsDWVC4KUAgAALwgqk4r0q/0Bp1AVNBRiRXR2cYwOdQuZamJtQklAxjiAN7w8/OLstaUsIvWbKkpMTEhF/sZ3mJK9N49MiHYmFBgQciaCsVQNyn5VpGiJniMmsASIA+lBEp+xMAIoCaZDZtDuwBVOVRpAF57tLr23N2WXDw8ytAxXwXyw8z8wxg830I26R0MhNKrfsGB/ty/DOLhOKyUH1QYUGZmPInqaoaMFE6Qi5MCXH4576QrW6/FGnrTIeQwc/2NG+EQ9C1hg8yMred4kL0wdqHzVsVCa9+ldH54OjRGxeunL4tLBKX7QdllHEtHgdABHZAAPUgJIQg+NtaaDhYexcOeUc/n5A+ZcbP78BBaB6288Q2GVcnJSWFsI84uHnCzKt3vtiZL8JAovydF09ezZSJU1LyxGIu9zEAkBXT3G44G/8pDtQ/T8SQnF6ckz703hfk6LtjRVWkRUoKONaCBFDtLrpz9WK1/CKFGIqrL17tzgTfW1j8FYDiKAQClI0wKf59X1BfwxbxRDwea/G9wGmtP8FEHrUIpoHdZzO3yVJ0kAfITy26/SWAUnnQMOVnBgzbKbuTCbE3koKPcWh5u3lBMiKC7L+dSV5c+BY1ispYvLzyxYc/3YD7kkU8LHHFp35AQBlWStHV3zwwOAcxRg5ngFBx+U4mRdXgyQAG5d6a0J6nonH9HwDmzcMBYP78yk2/vokAjAFgVyr/yjYhRa7Mq19IiXbMYBlTQSQCDztyMFKoAMDHAHoTdEciF0YHED2/cjNyAQkQvGr3HwSZJ75zwqmETYZ8+ThJ0HhC5kjReRIA1AOmOeQCas/fjsoFALA+Zh3MGQwAWJ3qvuvTs5cjHSkg4cnMfIxHHgal1TvX7twhwshIYEh7NE85pjyRABUELdgC1Bv/aQdGAD4BIzgBEByz6/5ZmQ6R/6ffQfsPeyC629nS+nDa0IVERIPy5eOWy5GyJwOgvgBOgHpg9PeDMemCMxvnRxMAUSSAe0zArvuXI+FjzE98J2L4ImtOF1sLk9MkQaaDU9ZhOHk90Nl8OVKoCAACEbJx2mgAcAQQHdM4AhAQkJoKny0UkhuADsMv9LmmJQcFhYdH5Hy+FuMQW3Cupb5KLFMAADXR3Ntt7ty/rQMvETGAt29cH10ZU0PEAP5GINxZBaTev7xNfPjOL1c8cA6Gg61BtmeyICIo3DQ8wjniOQY4gcdK7GtqrhILHR0VIDC1YFRVbD7slaSXODQUA07XspavMnkbAKDUSNct6e2sC1720akrX37/5XlYKL6d1R5h6ZqbBu04HJT8sAYjjpDVEsv65jIgoCiOAzdFN8XqhtCF7uJwV8fg4Isbr9V2iIzhkAKinXmjov3Mmfz8fieplMbzRZFZ08J2dc319BQExcbGRgxt9MWJS+XZza5sT5mOIgAKGhQVjeRbrNc1VsCZaJ4vA+exMNFCjEUC+OIjl3JwUqGi97QbpWxLRFAaFBQkKS08DpcLKAoDN7u6shMihRRFgoqkACB7oAItdtEisAIGYJ856PsCQjRCVA4cFOSS3rRsAgAgkEhK9S8dvJKPUdEOsEtdXS2by/K4FMWRqCAB9t3ERDyqNgDgxKGAfFEkaY9lExsRxMWZVonFh6/0EwD9uZtzXePq/SNligBAigB6Fm7frr1Im8ViEZZRo4F3CgBoG9hd5Fk9IjNSR3jieylOBKFzmiQtzVWQqTN2gFfrFvK2U7UxFnEuRMYx9N7XV34nKhd5N8phrLXsDWxqamLHFUUKoTqeRzc5xnjHUK5EkpabWyYeKwA9bF8PTbSdB2dCEBjHUaMZXj+D3BYQ7AsioOL9nS5wa9QUmLDNwkLI3ZaPAdl21tHBOLglSLOE2ZyiUE8GGEjqFZHWcELzeDSaSCSSOjk5eXj09y/uf04up3nknPS2K0FQJM47WPTVO5jIdx6V9dzxnBwBjMrNbZGOYwWg0203fFIDWrdu3cu1L39zbQPowfyNPT09dXV1Pcsr730DXwp8/fXXd0lOY6yjge2i9m5mUdGJ0+fwRdrGDCrW2JocHhEhEDQnjAcgfc1nwX5+u4v5/OLnkfxcentdXFbD72q1JcExAdHR69evr7xXuQPKENEN24+ym9tOn776fQdjOzWKZYx5NOhHgAgAimIpLsUDK5anrkI35THo+4rguiUlxSV8OBmB+FnB7oRiSjZIWTQMQoGHs6rvnr94PhG+aYPuAIND7WCyqWl4bFBQXNuYY4CUQ/391ICYgAAwBABZJfxivhzAxYSPjklZWZvqGqD1ESHKYeFk0PBoVAYOs+NgjikCiA3fPPYglEtvzyqwHxCzC76tcM9C57Jivh8B4OLSa7Jp05Ilm5bwuxJhGGOgjDDmUOGrEviiB82uO261xJo6OwNDbBCk4fgAEAEAgAPcg5fBDvA3wQ6YkALrWcHgiODiriOYMZWBhMuTBg3F7/fdKpADxApTxglApzvs+XQVKBUmEOAAc3BL4LcSXRQ3NLz77vHk5Pc/+KDto7WQBsYcsE80JhpMI2sTEpwLrZ0JgJy2PMq4Aeh6zWeff371inrLOElEhHNCRsalS1VVBw6am1t15508fPjwnTuHTx5+/UY71EnwAAhR7LholOCvr29NEuRUdY8bADTl4bS5bt7erxM6efLwyZPd3Xndqj4+TOahQ0ymho+Bqizl9YKjR5zkhdIj8c3Q1oLQUASAEMIT8gzGDTAhXS89ZIquETAcgGVrmcN45SgUWlg4DksDSSelbKiv68b1xrWN5y7++G1rYXyhPogEiC8SW4wXIHuCoZ6ew5Q508y8NO20mEwDA1i5BgUEVuGJeEM88i6nxQ4Nwe3Ut62hps6FyD6JEF9wSWzx1ABGk83c7LTMmUw4XGtQSJOPS8gtC4rL9UxGN+TW6IbK358EKGgTy8YLAKIDgcOMSVMnwxYQAFY6Olxy+Y9/qKN5SlHsZpiJTSHurK39QQgD7MtkQp9DGuMGoBsa2jpMQgSzNL3LmQZWXC55KWHx+LIgMMQHYzcDgOmfAKzjM2QymeOhQz7jBQAvZBvqzSD2wE1TS4upSsmjQBxQniSxMDQHqm9BfHy8NaiwoCC0KpLrCEdRn3G7AGkCItCdQySjFoQhxIGCyp4nrkqIzcmJLUAMYP4SV8ylOELYWj0VwIIJhrYzphAEmnbm5gZkHDxRXLG4rC3BGnYgNCGjSpiXoqFhxVTVgH//VACIIIQg8EJeAACugiFThwsIYuHBgweFcD9lIdTRcTQgAlfnaQBAiEAXlaNZkAsQiQrnG0AgbtDyUuSL1oAbYgq8fUoAIHCAPZg6zWyWHRQk+MzxafwA9Al6tg5TpqKChAgMlA9AVKRJukBAFGUrZQMgL0BJJOIAFWVIxm5lA9DT9WxDoC1AHAAB1AMlAwABkQtTSSdAPVA2ACjbkGwLZpCNEAdKBwACojWiOPAm40DZAJCNqB6QBCgOlA6wIB3VAyjK8jhQPgA9O13PQRdSAXIB4kDZAPKK9EcuMCEMupULQPYFIDCCVAACiESlA0AkhkzSJUYkoiIpHwC8MENeDyAXmFbKBkBesEXJSI5ITDSlKRsgG0ZlGJGM5nqh5sxUPgCEAeyBgjhQFoBDCHlcAIJyppVyAcjOaEtEopcbUQ+UDgAEhnpAYGRm5gW90UD5APRs2ATUGicDARwXlA8A/0sRCHQhEiejEUlVVYkAI9lI1gMv1JyZSgcgDywOBAEcnc2ZqkoHIOsBFKTJRHMut1I+AIzKIagkQnOGo/P4AH4HGVksUOkD6jwAAAAASUVORK5CYII=',
    installUrl: {
      chrome: 'https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/freighter/',
      ios: 'https://apps.apple.com/app/freighter-wallet/id6449227687',
      android: 'https://play.google.com/store/apps/details?id=org.stellar.freighter',
    },
    platforms: ['browser-extension', 'web'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true,
    signMessage: true,
    submit: false,
  };

  async function sdk() {
    // Lazily imported so bundlers don't pull this into apps that don't use Freighter.
    return import('@stellar/freighter-api');
  }

  /**
   * Detects if we're running inside Freighter's mobile in-app browser.
   * Freighter's mobile app injects `window.stellar = { provider: "freighter",
   * platform: "mobile" }` — when this is present, the extension API is NOT
   * available, and the connection must go through WalletConnect instead.
   *
   * This is the same detection used by Stellar Wallets Kit:
   * https://github.com/Creit-Tech/Stellar-Wallets-Kit
   */
  function isFreighterMobileWrapper(): boolean {
    if (typeof window === 'undefined') return false;
    const stellar = (window as unknown as { stellar?: { provider?: string; platform?: string } }).stellar;
    return stellar?.provider === 'freighter' && stellar?.platform === 'mobile';
  }

  /**
   * Quick synchronous check for the Freighter extension's presence.
   * The extension injects `window.freighter = true` on page load — if this
   * is present, we know the extension is installed without needing to call
   * the async `isConnected()` API (which uses postMessage and can be slow).
   */
  function isFreighterExtensionPresent(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window as unknown as { freighter?: boolean }).freighter;
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // Inside Freighter's mobile in-app browser, the extension API is not
      // available — connection must go through WalletConnect instead.
      if (isFreighterMobileWrapper()) return 'not-installed';

      // Fast path: the extension injects `window.freighter = true` on load.
      // If present, we know it's installed — skip the async isConnected() call
      // entirely. This avoids timeout issues on slow machines.
      if (isFreighterExtensionPresent()) return 'available';

      try {
        const { isConnected } = await sdk();
        // 3-second timeout — gives the extension time to respond via
        // postMessage. The extension's content script may need time to
        // initialize, especially on page load or when the extension was
        // recently installed/updated. 1s was too aggressive and caused
        // false "not-installed" on some machines.
        const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 3000));
        const result = await Promise.race([isConnected(), timeout]);
        if (result === 'timeout') return 'not-installed';
        const res = result as { isConnected?: boolean; error?: string };
        return res.isConnected ? 'available' : 'not-installed';
      } catch {
        return 'not-installed';
      }
    },

    async connect(_opts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        // Safety check — should never reach here because getReachability()
        // returns 'not-installed' in the mobile wrapper, but guard anyway.
        if (isFreighterMobileWrapper()) {
          throw ConnectError.invalidRequest(
            'Freighter extension API is not available inside the Freighter mobile in-app browser. Use WalletConnect instead.',
            undefined,
            meta.id
          );
        }
        const { setAllowed, getAddress } = await sdk();
        await setAllowed();
        const res = unwrapResult(meta.id, await getAddress());
        if (!res.address) throw ConnectError.internal('Freighter returned no address.', undefined, meta.id);
        return { address: res.address, walletId: meta.id };
      });
    },

    async disconnect() {
      // Freighter has no programmatic "revoke" call — disconnect is app-side session clearing.
      return;
    },

    async getAddress(): Promise<GetAddressResult> {
      return withNormalizedError(meta.id, async () => {
        const { getAddress } = await sdk();
        return unwrapResult(meta.id, await getAddress());
      });
    },

    async getNetwork(): Promise<GetNetworkResult> {
      return withNormalizedError(meta.id, async () => {
        const { getNetworkDetails } = await sdk();
        const res = unwrapResult(meta.id, await getNetworkDetails());
        return { network: res.network, networkPassphrase: res.networkPassphrase };
      });
    },

    async signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult> {
      return withNormalizedError(meta.id, async () => {
        const { signTransaction, setAllowed } = await sdk();
        const call = async () =>
          unwrapResult(
            meta.id,
            await signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase,
              address: opts?.address,
            })
          );
        const res = await retryOnLostConnection(call, () => setAllowed()).catch((err: unknown) => {
          throw ensureRetryableSignError(err, meta.id);
        });
        return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
      });
    },

    async signAuthEntry(authEntryXdr: string, opts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        const { signAuthEntry, setAllowed } = await sdk();
        const call = async () =>
          unwrapResult(
            meta.id,
            await signAuthEntry(authEntryXdr, {
              networkPassphrase: opts?.networkPassphrase,
              address: opts?.address,
            })
          );
        const res = await retryOnLostConnection(call, () => setAllowed()).catch((err: unknown) => {
          throw ensureRetryableSignError(err, meta.id);
        });
        // freighter-api returns the signed entry as a raw Buffer (or null on
        // some versions/error paths) rather than a pre-encoded string.
        if (!res.signedAuthEntry) {
          throw ConnectError.internal('Freighter returned an empty signed auth entry.', undefined, meta.id);
        }
        return {
          signedAuthEntry: bufferLikeToBase64(res.signedAuthEntry),
          signerAddress: res.signerAddress,
        };
      });
    },

    async signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        const { signMessage, setAllowed } = await sdk();
        const call = async () =>
          unwrapResult(
            meta.id,
            await signMessage(message, {
              networkPassphrase: opts?.networkPassphrase,
              address: opts?.address,
            })
          );
        const res = await retryOnLostConnection(call, () => setAllowed()).catch((err: unknown) => {
          throw ensureRetryableSignError(err, meta.id);
        });
        // Freighter has shipped two response shapes across versions: an
        // older one returning a raw Buffer (nullable), and a newer one
        // returning an already-encoded string. Normalize both to a string.
        if (!res.signedMessage) {
          throw ConnectError.internal('Freighter returned an empty signed message.', undefined, meta.id);
        }
        // Freighter uses SEP-0053 message encoding (confirmed by reading
        // the extension source at extension/src/helpers/stellar.ts):
        //   SIGN_MESSAGE_PREFIX = "Stellar Signed Message:\n"
        //   encodeSep53Message = (message) => sha256(prefix + utf8(message))
        // The signature is over the SHA-256 hash of the prefixed message,
        // NOT the raw message bytes. We surface this hash as `signedData`
        // so the verifier can verify against it directly.
        const sep53Prefix = Buffer.from('Stellar Signed Message:\n', 'utf-8');
        const messageBytes = Buffer.from(message, 'utf-8');
        const signedData = await sha256Base64(Buffer.concat([sep53Prefix, messageBytes]));
        return {
          signedMessage: bufferLikeToBase64(res.signedMessage),
          signerAddress: res.signerAddress,
          signedData,
        };
      });
    },
  };

  return connector;
}

/** Freighter's signAuthEntry/signMessage have returned either a raw Buffer or an already-encoded string across versions — normalize both to base64. */
function bufferLikeToBase64(value: string | { toString(encoding: 'base64'): string }): string {
  return typeof value === 'string' ? value : value.toString('base64');
}

/** Freighter's connection-class error messages — the extension lost/revoked this origin's authorization ("Connection not found. Please try creating a new connection…") or the postMessage round-trip glitched ("Connection was lost in transit. Try again"). */
const CONNECTION_LOST_PATTERNS: RegExp[] = [
  /connection not found/i,
  /connection was lost/i,
  /lost connection/i,
];

/** True when the error (any shape) is a Freighter connection-class failure. */
function isConnectionLostError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (err as { message?: string })?.message ?? String(err ?? '');
  return CONNECTION_LOST_PATTERNS.some((re) => re.test(message));
}

/**
 * Runs a Freighter sign call; on a connection-class failure, re-establishes
 * the dapp's authorization (setAllowed — Freighter's own "create a new
 * connection" advice, resolved silently when access is still granted) and
 * asks for the signature exactly once more. Any other failure — or a second
 * connection failure — propagates untouched.
 */
async function retryOnLostConnection<T>(
  call: () => Promise<T>,
  reestablishAccess: () => Promise<unknown>
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!isConnectionLostError(err)) throw err;
    await reestablishAccess();
    return call();
  }
}

/**
 * Wraps a connection-class failure that survived the retry above into a
 * friendlier ConnectError: the wallet is telling the user to re-authorize,
 * so the message keeps the wallet's guidance but gets a stable `code`
 * (type 3 external-service) instead of bubbling up as an opaque string.
 */
function ensureRetryableSignError(err: unknown, walletId: string): unknown {
  if (isConnectionLostError(err)) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : String((err as { message?: string })?.message ?? err);
    return ConnectError.externalService(message, undefined, walletId);
  }
  return err;
}

/**
 * SHA-256 over raw bytes, base64-encoded, adapted to the runtime:
 * - WebCrypto `crypto.subtle` when available (all modern browsers, Node >= 18,
 *   bun) — the common path, no extra code downloaded.
 * - Pure-JS `js-sha256` fallback for runtimes without `crypto.subtle`
 *   (React Native/Hermes), lazily imported so bundlers only pull it there.
 *
 * Deliberately never imports the Node `crypto` module — the bare specifier
 * breaks Metro/React Native bundling — and never touches Buffer, so the whole
 * path is polyfill-free on every platform.
 */
async function sha256Base64(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer — satisfies BufferSource on every TS lib
  // version and decouples the digest from the caller's buffer.
  const input = new Uint8Array(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = new Uint8Array(await subtle.digest('SHA-256', input));
    return bytesToBase64(digest);
  }
  const { sha256: pureSha256 } = await import('js-sha256');
  return bytesToBase64(hexToBytes(pureSha256(input)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
