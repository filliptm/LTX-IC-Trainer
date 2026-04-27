# LTX-2 webui — frontend

React + Vite + TypeScript control plane for the LTX-2 training toolkit.

## Quick start

```bash
# one-time
corepack enable
corepack use pnpm@10
pnpm install

# dev (needs backend running at 127.0.0.1:7860)
pnpm dev              # http://localhost:5173

# production build — writes dist/ that the backend serves on /
pnpm build

# type check
pnpm typecheck
```

## Layout

- `src/routes/` — file-based TanStack Router routes (10 pages)
- `src/components/ui/` — hand-written shadcn-style primitives
- `src/components/common/` — ProcessControls, ProcessConsole, CommandPreview
- `src/components/layout/` — Sidebar, Header, Layout
- `src/api/` — TanStack Query hooks per backend router
- `src/stores/` — Zustand stores (UI theme, recent projects)
- `src/styles/globals.css` — Tailwind + CSS variable design tokens
- `src/lib/utils.ts` — `cn()` helper + formatters

## How dev mode works

1. FastAPI backend on `127.0.0.1:7860` serves `/api/*`, `/sse/*`, `/data/*`.
2. Vite dev server on `5173` serves `/` and hot-reloads on edits.
3. `vite.config.ts` proxies `/api`, `/sse`, `/data` to the backend.

Start the backend separately: `python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860`. Or let the backend spawn Vite itself via `python -m ltx_ic_lora_trainer.webui --dev`.

## Build artifacts

`dist/` and `*.tsbuildinfo` are git-ignored. Rebuild with `pnpm build` on a fresh clone. The backend checks `frontend/dist/index.html` at startup and falls back to a helpful stub page when absent.
