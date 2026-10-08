# DO NOT DEPLOY

This CF-00 proof of concept exposes arbitrary SQL, migration and outbox-inspection routes behind `ALLOW_TEST_ENDPOINTS`, ships development secrets in `wrangler.jsonc`, and contains an unreviewed client-derived password mode. It exists only as historical research evidence.

The deployable successor with all diagnostics removed at build time is `../cf01-auth-poc/`.
