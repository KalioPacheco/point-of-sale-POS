# QA deployment: SPA routes and CORS

## Backend

`middleware/httpAccess.js` always authorizes the exact first-party origin
`https://point-of-sale-app-silk.vercel.app`. `CORS_ORIGINS` adds other exact
HTTP(S) origins, preserving existing deployments. If unset, localhost:5173
remains available for development. No blanket vercel.app subdomain permission
or wildcard is granted.

This explicit first-party origin is versioned in code, not an environment
fallback: an older Render CORS_ORIGINS value cannot accidentally exclude it.
If that domain is retired or transferred, remove it from the code allowlist.
Invalid origins, paths, credentials, queries and wildcards in CORS_ORIGINS
stop startup with a configuration error rather than broadening access.

The middleware sets Vary: Origin even for denied/absent origins, preserves
other Vary values, and runs before body parsing. CORS does not replace JWT,
role or tenant authorization. OPTIONS keeps HTTP 200; protected endpoints
still require valid credentials.

## Frontend

The frontend repository now contains vercel.json with the Vite SPA rewrite
to /index.html. It follows the [official Vercel Vite guide](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).
Normal filesystem resource precedence is retained. Do not enable cleanUrls
without adjusting the rewrite target. The new configuration takes effect
only when the frontend is redeployed.

## Release verification

1. Deploy the backend change to the Render service actually used by the frontend.
2. Confirm Render starts successfully with its configured CORS_ORIGINS.
3. Deploy the frontend with vercel.json included at the project root.
4. Open /login and /app/pos directly and reload each. React should load; without
   a session the protected page should redirect to the application's login.
5. Verify served JS/CSS resources still return JavaScript/CSS, not index HTML.
6. Send OPTIONS to /users/login and /sales with Origin equal to the public POS.
   Expect Allow-Origin to equal that exact origin. An unrelated origin must
   not receive Allow-Origin.
7. Confirm account/company/database isolation before making QA transactions.

Example read-only check (no credentials or sales submitted):

```sh
curl -i -X OPTIONS https://point-of-sale-pos-9093.onrender.com/users/login \
  -H 'Origin: https://point-of-sale-app-silk.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Local checks: npm run check in each repository; backend test/http-access.test.js
exercises real local HTTP preflight responses and rejects untrusted origins.
Frontend deployment.test.ts checks the configuration contract, not the Vercel
edge runtime. Live post-deploy verification remains required.
