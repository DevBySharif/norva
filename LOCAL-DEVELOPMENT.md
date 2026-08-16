# NORVA — Local Development

## Start locally

Double-click **`run-local.bat`** in the project root.

OR run manually:

```bat
cd /d D:\Websites\E-Commerce
npm run dev
```

Then open:

- Storefront: http://localhost:3000
- Admin:      http://localhost:3000/admin/login

The browser opens automatically ~12 seconds after `run-local.bat` starts.

## Stop

Press **`Ctrl+C`** in the development terminal, or double-click **`stop-local.bat`**
(stop-local.bat only stops the Node server listening on port 3000 — it never
kills unrelated Node processes).

## Requirement

PostgreSQL must be running and the ignored local `.env` file must remain configured.

No credentials are stored in `run-local.bat`, `stop-local.bat`, or this document.

## SAFE WORKFLOW RULES (CRITICAL)

> [!WARNING]
> NEVER run `next dev` and `next build` (or `next start`) concurrently in the same project directory. This causes concurrent writes to the `.next` directory and will result in corrupted build artifacts (e.g., missing vendor chunks).

Follow these distinct workflows:

**DEV WORK:**
- Use `run-local.bat` or `npm run dev`

**E2E / PRODUCTION VERIFICATION:**
1. **Stop dev server first** (use `stop-local.bat` or `Ctrl+C`).
2. Ensure ports `3000` and `3110` are free.
3. Delete `.next` directory if transitioning from a long or stale dev session.
4. Run `npm run build`.
5. Run `npm run test:e2e` (or `npm start`).