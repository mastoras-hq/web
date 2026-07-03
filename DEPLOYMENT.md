# Static deployment

1. Set `TURNSTILE_SITE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   and `API_ORIGIN` as environment-specific Cloudflare build variables.
2. Run `npm ci`; Wrangler runs `npm run build` before deploying `dist/`.
3. Use a preview deployment with the staging API/Auth redirect URLs first.
   Cloudflare's documented always-pass test widget may be used only in preview;
   production must use the hostname-restricted live widget.
4. Verify `_headers` on actual responses, including CSP and no-store/noindex for
   Advisor, HQ, login and callback.
   The CSP deliberately retains `script-src 'unsafe-inline'` only for
   Cloudflare JavaScript Detections, while `script-src-attr 'none'` blocks inline
   event attributes. Do not remove the former until Cloudflare injection has a
   tested nonce-compatible replacement.
5. Add `Strict-Transport-Security` only after HTTPS, redirects and all subdomains
   have been validated; then use `max-age=31536000; includeSubDomains`.
6. Confirm Turnstile hostname restrictions and perform contact, BRICK and taster
   smoke submissions against staging.
7. Do not publish the updated privacy policy until processor locations and legal
   wording have been reviewed.

The source remains static HTML/CSS/native JavaScript. The build only copies files
and injects public, environment-specific endpoints and browser keys; no framework
or client secret is added. Staging must use the staging Supabase project and API.
