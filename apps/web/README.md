# @atropyle/web

The Atropyle web app v2: Next.js 16, exported as a static site and built for two targets.

| Target            | Hosting                             | Backend                                        | Build                                                 |
| ----------------- | ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `deweb` (default) | DeWEB, 100% on-chain                | None: the build never contains the backend URL | `npm run build -w apps/web`                           |
| `vercel`          | Vercel, configured by `vercel.json` | Supabase Functions at `NEXT_PUBLIC_API_URL`    | `NEXT_PUBLIC_TARGET=vercel npm run build -w apps/web` |

Build the circuits and the SDK first (`npm run build` at the repository root): the app reads the SDK's `dist`.

## Commands

```bash
npm run dev -w apps/web            # next dev
npm test -w apps/web               # unit tests (Vitest, happy-dom)
npm run typecheck -w apps/web
npm run test:build -w apps/web     # two real production builds, then checks on their output
npm run worker:check -w apps/web   # the proof worker under a strict CSP in Chromium
npm run e2e -w apps/web            # Playwright on a local anvil with a test wallet; needs `forge build` in contracts/
SCREENS=1 npm run e2e -w apps/web -- --project=desktop   # design-review screenshots into test-results/screens/
npm run build -w apps/web && npm run size -w apps/web
npm run lighthouse -w apps/web     # after a production build; reports in lighthouse-report/
```

`npm run playwright:install -w apps/web` installs Chromium once, for `test:build`, `worker:check`, `e2e` and `lighthouse`. `worker:check` and `e2e` build into `out/` too, so build again before `size` and `lighthouse`.

## Build variables

| Variable                 | Values                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `NEXT_PUBLIC_TARGET`     | `deweb` (default) or `vercel`                               |
| `NEXT_PUBLIC_CHAIN`      | `xlayer` (default) or `local`                               |
| `NEXT_PUBLIC_DEPLOYMENT` | A deployment JSON, for e2e and local work                   |
| `NEXT_PUBLIC_API_URL`    | `vercel` only: `https://<project>.supabase.co/functions/v1` |
| `NEXT_PUBLIC_DOCS_PATH`  | `/docs/` when the site carries its own docs                 |

Set them in the environment of the build, not in a `.env` file: `npm run build` and `npm run dev` ignore `.env` files for every one of them. The CSP of every page is computed from the build environment, so the bundle reads the same values, and a leftover `.env.local` cannot point a build at the devnet. On Vercel, `NEXT_PUBLIC_API_URL` lives in the project settings.

## Security

- **CSP.** After `next build`, every page gets a `<meta>` policy with the SHA-256 of each of its inline scripts (`scripts/lib/csp.ts`). `connect-src` allows the RPC nodes of the deployment, plus the backend on `vercel`. `vercel.json` adds `frame-ancestors 'none'`, which a meta policy cannot carry, and repeats `object-src`, `base-uri` and `form-action` for responses without a meta tag.
- **No telemetry, no third parties.** The build sets `NEXT_TELEMETRY_DISABLED=1`. Fonts are self-hosted with their OFL licences in `public/licenses/fonts/`. Lighthouse runs on this machine against the local build.
- **Zero keys.** The app never asks for a key or a seed phrase; people sign in their own wallet. The e2e wallet holds no key either: it sends from unlocked accounts of a local anvil.
- **Untrusted text.** Token names, revert reasons and wallet names are shown through `UntrustedText`, never as HTML or as a link.
- **Readable without JavaScript.** Every page prerenders its text, links and footer; `test/e2e/nojs.spec.ts` opens them with JavaScript off.

## Budgets

Spec §11 (ruling R23), checked in CI: first-load JS of `/` at most 200 kB gzip, any other route at most 240 kB, all JS of the site at most 900 kB (`size-limit`). `npm run size` reads `out/`; CI also measures the vercel build of `test:build` with `SIZE_OUT=test/build/.out/vercel`, since only that bundle carries the backend client. Lighthouse mobile on `/`: Performance at least 95; Accessibility, Best Practices and SEO 100; LCP at most 1.8 s, CLS 0, TBT at most 150 ms.

## Share card

A link to the site on X shows a large card. `src/config/share.ts` holds its text and its image, for this app and for `apps/web-legacy`, so the cutover changes no card.

- **vercel** carries every Open Graph and X tag, with absolute URLs on `https://atropyle.xyz/`, and copies the card image from `share/` (1200x630) to the root of `out/`. Home sets `og:url`; the other pages keep the card without one.
- **deweb** carries the text alone (`og:title`, `og:description` and the small `summary` card): no URL and no image, so it links nothing off-chain and puts no image on chain. The `deweb` and `pages` builds of `apps/web-legacy` do the same.
- `npm run og:image -w apps/web` renders the image again in Chromium, with the site's own fonts, its night colours and the Thread of the home page. Give a changed image a new name in `src/config/share.ts` (`image.path`) first, since X keeps a card by its image URL, and commit the result: `test/unit/share.test.ts` checks its size, not its pixels, since rendering differs a little between systems.

After a Vercel deploy, read the live tags and the image:

```bash
curl -s https://atropyle.xyz/ | grep -oE '<meta (property|name)="(og|twitter):[^>]*>'
```

```bash
curl -sI https://atropyle.xyz/og-v2.png
```

The first lists `og:url`, `og:image` and `twitter:card` set to `summary_large_image`; the second answers `200` with `content-type: image/png`. Then paste the link into a reply on X: the composer shows the card once X has fetched it. X keeps a fetched card for about a week.
