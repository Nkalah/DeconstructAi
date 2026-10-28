# DeconstructAI Audit

## 1) Stack
- Framework: React 19 + TypeScript SPA (`src/App.tsx`, `src/main.tsx`)
- Bundler: Vite 8 (`vite.config.ts`)
- Language: TypeScript on the client and server (`tsx server.ts`)
- Package manager: Bun is the intended runtime (`bun run dev`, `bun run build`), although an npm lockfile is also present
- Server setup: Express app in `server.ts` with JSON body parsing, API endpoints, and Vite middleware in dev mode
- Vite mounting: in `server.ts` the app does `createViteServer({ server: { middlewareMode: true }, appType: 'spa' })` and then `app.use(vite.middlewares)`; in production it serves `dist/` static files via `app.use(express.static(...))`

## 2) Folder structure and purpose
- `server.ts`: Express server bootstrap, API routes, Vite dev mounting
- `server/services/analysisPipeline.ts`: multi-stage poster deconstruction pipeline; converts image into `SceneGraph`
- `server/services/aiAssistant.ts`: natural-language edit assistant using Gemini
- `server/services/geminiRetry.ts`: Gemini retry/rate-limit wrapper with quota handling
- `server/services/storage.ts`: in-memory design/job store (`Map`-based)
- `src/App.tsx`: app shell, initial sample load, autosave, modal state, editor composition
- `src/hooks/useDesignEditor.ts`: undo/redo, zoom, dirty state, selected layer state
- `src/lib/sceneGraphMutations.ts`: mutation engine for edits and canvas resizing
- `src/lib/samplePosters.ts`: demo poster SVGs used as starter content
- `src/lib/fontCatalog.ts`: curated font candidate catalog
- `src/types/sceneGraph.ts`: type system for canvas, layers, scene graph, mutations
- `src/components/*`: UI panels for upload, canvas, layers, inspector, export, assistant, failure review
- `src/index.css`: styling layer
- `index.html`: Vite entry HTML
- `vite.config.ts`: Vite config with React and Tailwind plugin
- `.env` / `.env.example`: environment config; `.env` currently contains the Gemini key

## 3) Existing routes, components, state management, and services
### Routes
- Frontend: no React Router; this is one-page app rendered from `src/main.tsx`
- Express API routes in `server.ts`:
  - `POST /api/pipeline/analyze`: run deconstruction pipeline on an uploaded image or SVG data URL
  - `POST /api/assistant/chat`: call the AI assistant with a prompt + scene graph
  - `POST /api/designs`: save a scene graph to in-memory store
  - `GET /api/designs/:id`: fetch a saved design
  - `POST /api/render/svg`: render scene graph to SVG

### Components
- `Header.tsx`: header controls, zoom, undo/redo, upload/export/assistant toggles
- `UploadModal.tsx`: image upload + “6-stage progress” UI and sample poster selection
- `CanvasEditor.tsx`: interactive artboard with drag, resize, rotate handles, inline text editing
- `LayerPanel.tsx`: layer visibility/lock/order controls and warning badges
- `PropertyInspector.tsx`: text/image/shape property editor and image replacement uploader
- `AIAssistantDrawer.tsx`: AI-assisted editing drawer
- `ExportModal.tsx`: export flow UI (likely PDF/SVG-oriented)
- `FailureModeReview.tsx`: low-confidence/warning review UI

### State management
- App-level UI state is in `App.tsx` via React `useState`
- Editor history/undo/redo is in `useDesignEditor.ts` with `historyRef`/`futureRef` plus `isDirty`
- `SceneGraph` is the shared canonical model for layers, transforms, warnings, and pipeline metadata
- Mutation logic is centralized in `sceneGraphMutations.ts` and invoked through `executeMutation`
- Autosave is debounced in `App.tsx` (`setTimeout` 1200 ms) via `POST /api/designs`

### Services
- `analysisPipeline.ts`: builds a real `SceneGraph` from image or SVG data; uses Gemini when non-SVG and a heuristic fallback for SVG
- `storage.ts`: in-memory persistence only; no database, no file system storage, no server-side temp directory
- `geminiRetry.ts`: rate-limit and retry wrapper for Gemini API errors, including 429/5xx handling and friendly error messages
- `fontCatalog.ts`: font family suggestions for matched text layers

## 4) AI/OCR provider and secret handling
- Current provider: Google Gemini via `@google/genai` (`GoogleGenAI`)
- Key loading: in `server/services/analysisPipeline.ts` and `server/services/aiAssistant.ts`, `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })`
- Secret exposure: no `VITE_` variables or `import.meta.env` usage in the frontend. The key is loaded only on the server side (`process.env` in server modules), so it is not exposed to the browser bundle by default.
- Caveat: the repository does contain a local `.env` with an actual GEMINI API key in the project root, which is server-side config but should not be committed or shared beyond the local environment.

## 5) What works vs. what is mocked, hardcoded, or broken
### What works
- Basic React app shell loads and renders
- Vite + Express dev server boots and serves the frontend in middleware mode
- A deconstruction pipeline endpoint exists and returns a `SceneGraph`
- `useDesignEditor.ts` implements undo/redo and keyboard shortcuts
- Layer editing and basic mutation operations are implemented in `sceneGraphMutations.ts`
- Upload modal and sample poster flow can trigger `/api/pipeline/analyze`
- Canvas has drag/resize/rotate interactions and layer selection behaviors
- Property inspector allows editing text content, font family, font size, color, alignment, opacity, effects, and image replacement
- Failure/warning review UI and layer warnings appear when confidence is low

### What is mocked, hardcoded, or weak
- `server/services/analysisPipeline.ts` contains a heuristic fallback that reconstructs a default poster layout when SVG input is used or when the AI step fails. It is not an exact reconstruction of the original poster; it is a deterministic template-like fallback
- `generateHeuristicDecomposition()` in `analysisPipeline.ts` hardcodes a generic conference poster structure rather than actual OCR/vision extraction from a random upload
- Image layers are created with placeholder SVGs in `analysisPipeline.ts` instead of true extracted or reconstructed image crops; this violates the “never flatten as editable” rule if exact reconstruction cannot be done
- The app currently accepts uploaded poster images but does not preserve original image data as a non-destructive “needs review” fallback in a robust, explicit way beyond storing `original_image_url`
- `UploadModal.tsx` simulates progress with a fake stage timer (`setInterval` and “currentStageIdx” logic) even while the server pipeline is running; it gives an illusion of step-by-step AI progress rather than actual stage telemetry
- `sceneGraphMutations.ts` implements many mutation operations, but there is no formal persistence schema or versioning beyond the in-memory `Map`
- `storage.ts` stores designs in memory only; there is no durable DB or file-based project system
- No actual QR generator, contact-data parser, or comparison engine is present yet
- The project does not yet add a real image extraction pipeline for cropped assets; the placeholder image generator in `analysisPipeline.ts` is a stub
- Some z-order and mutation logic is functional for a prototype, but not yet robust for production-grade poster editing

### Notable broken / incomplete areas
- There is no real OCR engine bound to a local or external service beyond Gemini’s image-analysis prompt; for real OCR text extraction, a second dedicated OCR adapter is missing
- There is no database-backed project model, so projects are not durable across restarts
- No real export pipeline beyond UI scaffolding is verified end-to-end
- No content ownership / watermark-safety enforcement beyond UI intent; upload model accepts arbitrary image data without explicit user-only validation at server level
- The “AI assistant” fallback and deterministic mutation logic are useful but still rule-based, not a full structured editing assistant with persisted instructions and validation

## 6) Current build status
Build command run: `bun run build`

Result: success with warnings only
- Status: `✓ built in 6.24s`
- Warning 1: Vite config warning about `__dirname` in `vite.config.ts` (`__dirname` is deprecated for Vite native config loader)
- Warning 2: large bundle warning because a chunk is >500 kB after minification (`index-ybriPmJ7.js` / large JS bundle)
- There were no actual build errors

## 7) Dependencies missing or outdated for canvas editor, OCR, QR, export, and storage
- Canvas editor: no dedicated editor engine such as `fabric` or `konva`/`react-konva` is installed; the project is currently custom DOM+transform logic, which is workable but not production-scale
- OCR/vision: `@google/genai` is present, but there is no dedicated OCR stack such as `tesseract.js`, `@google-cloud/vision`, or a provider abstraction interface for local OCR + VLM fallback
- QR + contact data: no `qrcode` / `qr-code-styling` or contact-data parser library is present
- Export: `jspdf` is present, but there is no strong end-to-end export pipeline with `html-to-image`, `svg` conversion or multi-page PDF assembly in the codebase
- Storage: there is no persistent DB library (`better-sqlite3`, `mongodb`, `postgres`, `@supabase/supabase-js`, etc.); current storage is in-memory only
- Image extraction / crop generation: no library for robust crop extraction, image inpainting, or object masking beyond simple generated placeholder SVGs
- Package health: the set is not obviously outdated, but the project is at a prototype stage rather than a polished editor stack

## Milestone plan
1. Schema
2. Upload
3. Analysis pipeline
4. Canvas
5. Text editing
6. Layers
7. Undo/autosave/projects
8. Image extraction
9. QR + contact data
10. Comparison
11. AI assistant
12. Export
13. Beginner templates
14. Hardening and tests

## Overall summary
The app is a promising prototype: it has a real server, a real scene graph, a real editor model, and a working Vite/React front end. However, the critical gap is that the “deconstruction” and “editable reconstruction” pipeline is only partially real and still contains template-like heuristics and placeholder image layers. The current codebase is a strong foundation, but it still needs durable storage, real OCR/image extraction, real QR/contact workflows, and stronger recovery/hardening before it can credibly deliver the product mission.
