# FlowLens — standalone Cloudflare Workers edition

The English TXFLOW wallet checker with official brand assets, trading history, CSV exports and the official volume-percentile ring. This edition has no dependency on ChatGPT hosting, sign-in, connectors or the original Sites project.

## Deployment on your Cloudflare account

Use Node.js 22.13 or later (Node.js 24 is recommended).

```sh
npm ci
npx wrangler login
npm run deploy
```

The login is completed directly with Cloudflare. Never put a Cloudflare password or API token in source files or chat. Select your own account if you have several. Keep the account on the Workers Free plan. No payment, paid-plan upgrade, custom domain or extra Cloudflare resource is configured by this project.

Wrangler prints the actual workers.dev address after a successful deployment. Use that returned address; no new deployment has occurred merely because this package exists.

The archive also includes a verified production build. To deploy those exact prebuilt files:

```sh
npx wrangler@4.92.0 login
npx wrangler@4.92.0 deploy --config wrangler.prebuilt.jsonc
```

For a Git import through the Cloudflare dashboard, use the repository root as the project root, `npm ci && npm run build` as the build command and `npx wrangler deploy --config wrangler.prebuilt.jsonc` as the deploy command. Select the Free plan.

## Free-plan architecture

- The page, JavaScript, CSS, logos and fonts are static assets.
- Only `/api/*` requests run Worker code. Static assets are served directly by Cloudflare.
- The API Worker is a small Web Standards ES module, with no SSR framework or Node runtime dependency.
- No database, KV namespace, R2 bucket, cron, custom domain, secret or paid binding is required.
- Trade history is requested in 500-row pages to keep per-request processing small. Partial-history labeling and Load more remain available.
- Official TXFLOW public read APIs supply the data; there is no wallet connection or transaction signing.

Cloudflare's Free plan has request and CPU limits. A small bundle and passing local checks are not proof of live CPU usage. The new workers.dev deployment must still be checked in the actual account after authentication, including `/api/health`, an active wallet, an unranked wallet and the percentile ring. Do not enable a paid plan automatically if a limit is reached.

## Verification

```sh
npm run check
npm run build
npm test
npm run deploy:check
npm run test:live
```

The tests cover decimal totals, deduplication, UTC days, pagination, upstream errors, cohort-based rank math, static routing, API method handling and the deployable Worker entry point. The live test only reads the public documentation Testnet wallet and makes no blockchain writes.

## Sources

- Official TXFLOW API: https://docs.txflow.com/api
- Official leaderboard: https://app.txflow.com/leaderboard
- Official brand kit: https://docs.txflow.com/resources/brand-kit
- Cloudflare static assets: https://developers.cloudflare.com/workers/static-assets/

Independent checker, not affiliated with TXFLOW.
