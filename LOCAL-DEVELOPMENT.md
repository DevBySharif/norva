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

## Command distinction

- **Normal daily development:** double-click `run-local.bat` (uses `npm run dev`, port 3000)
- **Production verification:** `npm run build` then `npm run start`
- **E2E verification:** `npm run test:e2e`