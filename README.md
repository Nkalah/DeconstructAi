# DeconstructAI — Poster to Editable Design Studio

DeconstructAI turns poster artwork into an editable, structured design document. Text, images, shapes, backgrounds, and QR codes remain individual layers so they can be edited and exported without flattening the project.

## Requirements

- Bun (recommended; the repository includes `bun.lock`) or a recent Node.js version with npm.
- A Gemini API key for AI-assisted raster poster analysis and AI editing. The app remains usable without one; built-in SVG samples can be analyzed locally.

## Run locally with Bun

```powershell
bun install
Copy-Item .env.example .env
# Edit .env and set GEMINI_API_KEY if you want AI features.
bun run dev
```

Open <http://127.0.0.1:3000>.

To type-check and run tests:

```powershell
bun run lint
bun test
```

To create and serve a production build:

```powershell
bun run build
$env:NODE_ENV = "production"
bun run start
```

`bun run start` serves the built client when `NODE_ENV=production`; for a static-only local preview, `bun run preview` runs Vite's preview server (API-backed features still require the Express server).

### npm alternative

```powershell
npm install
npm run dev
npm run lint
npm test
npm run build
```

## Environment variables

Copy `.env.example` to `.env`. The only required secret is needed for AI features:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | No (required for AI) | Server-side Google Gemini API key. Never expose this value in client code or commit it. |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `HOST` | No | Bind address; defaults to `127.0.0.1`. Set intentionally when exposing the server on a network. |
| `GEMINI_ANALYSIS_MODEL` | No | Gemini model used by the modular OCR/vision/QR/color providers; defaults to `gemini-2.5-flash`. |
| `GEMINI_MODEL` | No | Model override used by the legacy analysis pipeline, when supported by that pipeline. |
| `GEMINI_ASSISTANT_MODEL` | No | Model for structured AI edit proposals; defaults to `gemini-3.8-flash`. |
| `GEMINI_RPM` | No | Server-side Gemini request rate limit per minute; defaults to `4`. |
| `GEMINI_WINDOW_MS` | No | Rate-limit window override, primarily for tests; defaults to `60000`. |
| `APP_URL` | No | Reserved deployment/configuration value in the example environment file. |

AI requests are sent from the server to Google Gemini. The editor discloses when a user request and document summary (and, when available, a small preview) are sent to that provider. Uploaded originals and local project data are stored in the browser; server-side copies are best-effort and can be deleted from the project screen.

## Features

- **Editable reconstruction:** raster images are analyzed into structured text, image, shape, and background layers. Layer edits include move, resize, rotate, hide/show, lock/unlock, reorder, and delete. Images can be replaced.
- **Recovery and manual editing:** OCR, object detection, QR, and font uncertainty are surfaced for review. The original upload is retained as an image layer so manual edits remain possible when analysis is incomplete.
- **Undo, redo, and persistence:** document changes are history-backed; local autosave supports reopening an editable project. Server synchronization is best-effort and the UI reports local/offline save status.
- **QR and smart data:** detected QR layers show decoded destinations when reliable, can be regenerated in place, and have a high-resolution download. Smart data identifies common contact details and supports previewed bulk replacements.
- **AI assistant:** proposes validated structured document operations, previews the affected layers, and applies a proposal as one undoable edit. AI failure does not prevent manual editing.
- **Comparison and export:** compare the original and editable reconstruction, including overlays and per-layer visibility. Export artwork only as PNG, JPG, PDF, or safe SVG, with size/resolution choices and PNG transparency.
- **Beginner mode:** start a blank document at common print, social, and event-poster dimensions.
- **Accessibility and mobile:** labeled controls, keyboard-accessible dialogs/layers, visible focus indicators, and collapsible mobile editor panels.

## Providers and analysis behavior

- **AI/OCR/visual analysis:** Google Gemini, configured by `GEMINI_API_KEY`. The raster analysis providers use Gemini for OCR, visual regions, QR detection/decoding, and color reporting.
- **SVG sample analysis:** text and visual elements in supported SVG samples can be parsed locally without an external model.
- **Raster analysis:** requires a configured Gemini API key. Without it, raster analysis returns a clear error and does not substitute invented text or a template reconstruction; the retained original remains available for manual work.
- **Image segmentation:** no independent segmentation model is currently configured. Image regions remain replaceable image layers; do not interpret the current pipeline as pixel-perfect background removal.
- **Image preparation and local persistence:** browser image decoding, resizing/optimization, and IndexedDB project storage run locally.
- **QR generation:** QR codes are generated locally in the browser.

## Verification status and known limitations

The repository contains three built-in SVG sample posters, not a representative collection of raster poster photographs. Therefore, the six-poster raster acceptance matrix (including real people/product photos, low-resolution images, photographed print, and multilingual raster text) has **not** been verified end-to-end here. Automated tests use synthetic documents and mocked provider responses to exercise recovery and document operations. Real raster OCR and visual recognition quality depends on the configured Gemini model, image quality, script, and API availability.

Other limitations:

- Detected fonts are estimates; browser/system font availability may change the rendered appearance.
- Complex raster effects, photographs, and unsupported SVG features are preserved as image layers rather than converted to editable vector objects. SVG export is disabled or limited when those features cannot be represented safely.
- AI proposals depend on Gemini and may be unavailable due to configuration, network, quota, or provider errors. Changes are previewed and require explicit confirmation.
- The current segmentation provider is unconfigured; image replacement is supported, but isolated-object cutouts are not guaranteed.
- Browser storage is device-local and can be cleared by browser settings. This project does not provide account-based cloud backup or synchronization.

## Recommended next improvements

1. Build a consented, rights-cleared raster evaluation set covering the requested poster categories and languages, then measure OCR, region, and QR results per sample.
2. Integrate and test a dedicated segmentation/background-removal provider with clear consent, fallback, and cost controls.
3. Add browser end-to-end tests for upload/reopen/export and editing gestures across desktop and mobile viewports.
4. Add account-backed synchronization and a recovery/export workflow for local browser data.
