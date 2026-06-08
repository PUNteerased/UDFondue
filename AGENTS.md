# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

UDFondue is a static LINE LIFF reporting form (`index.html`) backed by a deployed Google Apps Script web app (`Code.gs`). There is no `package.json`, build step, Docker, or automated test/lint tooling in this repository.

### Running the frontend locally

From the repo root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/index.html`. Outside LINE, LIFF init fails gracefully and the form uses a mock user (`ผู้ใช้งานจำลอง (เดสก์ท็อป)`, `U-TEST-USER-ID`) so submissions can be tested from a desktop browser.

### Backend health check

The GAS web app URL is configured in `index.html` as `GAS_WEB_APP_URL`. Verify it with:

```bash
curl -sSL "$GAS_WEB_APP_URL"
```

Expected JSON: `{"status":"ok",...,"message":"UDFondue API is running"}`. Use `-L` because Google redirects the `/exec` URL.

### Lint / tests

No lint or test commands are defined in this repo. Validation is manual: serve `index.html`, submit a test report, and confirm rows appear in the linked Google Sheet (`SPREADSHEET_ID` in `Code.gs`).

### External services (not started locally)

| Service | Notes |
| --- | --- |
| Google Apps Script | Deploy `Code.gs` from Google Sheets; after edits, create a **New version** deployment (Save alone is not enough). |
| Google Sheets / Drive | IDs are hardcoded in `Code.gs`. |
| LINE LIFF | Optional for full LINE E2E; desktop testing works without it. |

### Configuration

All config is hardcoded in source files (`GAS_WEB_APP_URL`, `LIFF_ID` in `index.html`; `SPREADSHEET_ID`, `FOLDER_ID` in `Code.gs`). There is no `.env` file.
