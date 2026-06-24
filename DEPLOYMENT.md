# Static deployment

1. Set `TURNSTILE_SITE_KEY` as a Cloudflare build variable.
2. Run `npm ci && npm run build`; deploy `dist/` (Wrangler is configured for it).
3. Use a preview deployment with the staging API/Auth redirect URLs first.
4. Verify `_headers` on actual responses, including CSP and no-store/noindex for
   Advisor, HQ, login and callback.
5. Add `Strict-Transport-Security` only after HTTPS, redirects and all subdomains
   have been validated; then use `max-age=31536000; includeSubDomains`.
6. Confirm Turnstile hostname restrictions and perform contact, BRICK and taster
   smoke submissions against staging.
7. Do not publish the updated privacy policy until processor locations and legal
   wording have been reviewed.

The source remains static HTML/CSS/native JavaScript. The build only copies files
and injects the public Turnstile site key; no framework or client secret is added.
