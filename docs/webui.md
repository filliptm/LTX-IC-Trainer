# Web UI

The FastAPI backend + React/Vite frontend that ship with the project. Lives under [src/ltx_ic_lora_trainer/webui/](../src/ltx_ic_lora_trainer/webui/).

```
src/ltx_ic_lora_trainer/webui/
├── __main__.py             # `python -m ltx_ic_lora_trainer.webui` entry point
├── server.py               # FastAPI app factory
├── command_builder.py      # ProjectConfig → argv for ltx2_*.py scripts
├── project_schema.py       # Pydantic v2 config (ProjectConfig + nested sections)
├── process_manager.py      # subprocess manager with Windows CTRL_BREAK_EVENT + log broadcast
├── metrics_writer.py       # JSONL metrics writer
├── toml_export.py          # dataset_config.toml + slider_config.toml serializer
├── ws_hub.py               # multiplexed WebSocket hub (system, process, metrics, caption channels)
├── routers/                # 9 FastAPI routers
│   ├── captions.py, datasets.py, filesystem.py, metrics.py, processes.py,
│   │ projects.py, samples.py, stats.py, system.py
│   └── __init__.py
└── frontend/               # React + Vite + TypeScript app
    ├── package.json, tsconfig.json, tailwind.config.ts, vite.config.ts,
    │ postcss.config.js, index.html, pnpm-lock.yaml, README.md
    └── src/
        ├── main.tsx, routeTree.gen.ts
        ├── routes/          # 2 file-based TanStack Router pages (Data, Train)
        ├── components/ui/   # 15 shadcn-style primitives
        ├── components/common/   # ProcessControls, ProcessConsole, CommandPreview
        ├── components/layout/   # IconRail, ContextPanel, ContextPanelContext, Header, Layout, SystemStrip
        ├── features/project/    # HyperparameterPage + HyperparameterSidebar + TrainingActionRail + 8 section components
        ├── features/dataset/    # DatasetEntryCard (legacy)
        ├── features/data/       # DatasetSidebar, DatasetWorkspace, DatasetToolbar, MediaGrid, MediaTile, DatasetSettings, DatasetList, ProjectLoadDialog
        ├── features/captions/   # MediaPreview, AssetBrowser, CaptionEditor
        ├── features/train/      # Terminal, StopEditResumeControls, Charts
        ├── features/validation/  # CheckpointList
        ├── hooks/               # useWebSocketLogs (per-process), useWebSocketHub (multiplexed)
        ├── api/             # 10 TanStack Query hook modules (projects, system, processes, metrics, filesystem, samples, captions, checkpoints, datasets)
        ├── stores/          # Zustand stores (uiStore, projectStore)
        ├── lib/utils.ts     # cn() + formatters
        └── styles/globals.css   # Tailwind + design tokens
```

## Launching the webui

**Prerequisites:** install the `webui` extra (`uv sync --extra cu128 --extra webui`), build the frontend once (`cd src/ltx_ic_lora_trainer/webui/frontend && pnpm install && pnpm build`).

**Production mode** — serves the built frontend from `frontend/dist/`:

```bash
python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860
```

Or double-click [`run.bat`](../run.bat) on Windows — it activates the venv and runs the above.

**Dev mode** — spawns the Vite dev server on port 5173 alongside the FastAPI backend on port 7860, with hot reload:

```bash
python -m ltx_ic_lora_trainer.webui --dev
```

The Vite proxy forwards `/api`, `/sse`, `/data` from `5173` to `7860`. Open `http://localhost:5173` for HMR, or `http://localhost:7860` for the production bundle. Vite is killed cleanly on shutdown via `CTRL_BREAK_EVENT` (Windows) or `SIGTERM` (Unix).

## Backend

### CLI entry point — [`__main__.py`](../src/ltx_ic_lora_trainer/webui/__main__.py)

```
usage: python -m ltx_ic_lora_trainer.webui [-h] [--port PORT] [--host HOST]
                                     [--project PROJECT] [--dev]
                                     [--dev-port DEV_PORT]
```

- `--port` — server port (default 7860)
- `--host` — server host (default 127.0.0.1; pass 0.0.0.0 for LAN access)
- `--project PATH` — project.json to auto-load on startup (accepts a directory containing project.json)
- `--dev` — spawn Vite dev server alongside FastAPI
- `--dev-port` — Vite port (default 5173)

### FastAPI app factory — [`server.py`](../src/ltx_ic_lora_trainer/webui/server.py)

`create_app(project_path: Optional[str]) → FastAPI`:

1. Initialises app state: `process_manager` (ProcessManager instance), `project_config` (Pydantic ProjectConfig or None), `project_path` (Path or None).
2. If `project_path` was passed, auto-loads via `ProjectConfig.load(path)`.
3. Registers **9 routers** (see below).
4. Registers the WebSocket hub at `/ws/hub` (see `ws_hub.py` below).
5. Exposes `GET /sse` — SSE heartbeat that polls `metrics.jsonl` mtime every 2 seconds and emits an `update` event on change.
6. Falls through to serving the built React frontend from `frontend/dist/` with SPA-style catch-all (any unknown route returns `index.html`). If `dist/` is missing, serves a stub page telling the user to run `pnpm build`.
7. Registers Windows MIME type fixes (`.js` → `application/javascript`, `.css` → `text/css`) to avoid the Windows registry falsely reporting `text/plain`.

### Routers — [`routers/`](../src/ltx_ic_lora_trainer/webui/routers/)

50 endpoints across 9 files. Quick reference:

#### Projects — [`routers/projects.py`](../src/ltx_ic_lora_trainer/webui/routers/projects.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/project/schema` | Pydantic JSON schema for ProjectConfig (for frontend sync checks) |
| GET | `/api/project` | Current loaded project: `{loaded, config, project_path}` |
| POST | `/api/project` | Create a new project; saves `project.json` to disk |
| PUT | `/api/project` | Update the currently loaded project |
| DELETE | `/api/project` | Close the project (clears app state) |
| POST | `/api/project/load` | Load a project from a path (auto-resolves directory → `project.json`) |
| GET | `/api/project/discover?root=&max_depth=3` | Recursively scan *root* (default: server CWD) for `project.json` files and dataset directories (dirs with media + caption files). Returns `{root, projects: [...], datasets: [...]}`. Each discovered dataset includes `siblings` (sibling dirs: cache, references, output, logs), `cache_status` (latent/text encoder cache counts), and `toml_config` (parsed from `dataset_config.toml` if present). |
| POST | `/api/project/auto-populate` | Body: `{dataset_index, discovered}`. Auto-fills a project's dataset entry paths (directory, cache, references, output, logs) and training config from a discovered dataset's sibling directory structure + TOML config. Saves project.json. |

#### Datasets — [`routers/datasets.py`](../src/ltx_ic_lora_trainer/webui/routers/datasets.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/dataset/config` | Get the `DatasetConfig` section of the loaded project |
| PUT | `/api/dataset/config` | Update the `DatasetConfig` section |
| POST | `/api/dataset/export-toml` | Write `dataset_config.toml` to disk |
| GET | `/api/dataset/preview-toml` | Preview the TOML without writing |
| GET | `/api/dataset/cache-status` | Report cache completeness per dataset entry: `{datasets: [{index, total_assets, latent_cached, text_cached, needs_text_cache, needs_latent_cache}]}` |
| POST | `/api/dataset/create` | Create a named dataset with auto-managed directory structure under `{project_dir}/datasets/{slug}/`. Body: `{name, type}`. Returns `{ok, index, entry}`. |
| DELETE | `/api/dataset/{index}` | Remove a dataset entry from the project (does not delete files on disk). |
| POST | `/api/dataset/{index}/thumbnail` | Upload a thumbnail image for a dataset. Multipart: `file`. Returns `{ok, path}`. |
| GET | `/api/dataset/{index}/assets` | List paired media assets with eagerly-loaded caption text and reference matching. Query: `caption_extension`, `limit`, `offset`. Returns `{total, assets: [{filename, type, size_bytes, has_caption, caption_text, has_reference, reference_filename}]}`. |
| POST | `/api/dataset/{index}/upload` | Upload files to a dataset's target or reference directory. Form: `files`, `slot` ("target"\|"reference"), `caption_extension`. Target uploads auto-create blank caption files. |
| GET | `/api/dataset/{index}/media/{file_path}` | Serve media from a dataset's target or reference directory. Query: `slot` ("target"\|"reference"). Path-traversal protected. |
| GET | `/api/dataset/{index}/thumb/{file_path:path}` | Serve a thumbnail for a dataset media file (auto-generated for video and image assets, cached on disk). Path-traversal protected. |

#### Processes — [`routers/processes.py`](../src/ltx_ic_lora_trainer/webui/routers/processes.py)

| Method | Path | Description |
|---|---|---|
| POST | `/api/processes/{proc_type}/start` | Build argv from project config and spawn subprocess. Clears any stashed resume state for this proc_type. |
| POST | `/api/processes/{proc_type}/stop` | Send `CTRL_BREAK_EVENT` (Windows) / `terminate` (Unix), fall back to kill after 30s. No state dir tracking. |
| POST | `/api/processes/{proc_type}/pause` | Graceful stop + scan `training.output_dir` for the most recent saved state directory (any dir with `state` in its name) and stash it on the `ProcessManager`. Waits up to ~30s for `save_state_on_train_end` to land. Returns `{ok, resume_state_dir}`. |
| POST | `/api/processes/{proc_type}/resume` | Rebuild training argv + prepend `--resume <stashed_dir>` + relaunch. Falls back to scanning `training.output_dir` directly if nothing is stashed. 400 if neither source has a state dir. |
| GET | `/api/processes/{proc_type}/status` | `{state, exit_code, resume_state_dir}`. State ∈ `{idle, running, stopping, finished, error}`. |
| GET | `/api/processes/{proc_type}/logs` | Buffered stdout/stderr lines (optional `?last_n=N`). Still available for low-cadence polling clients — the new WebSocket endpoint below is faster. |
| GET | `/api/processes/{proc_type}/command-preview` | Return `{command: "..."}` (space-joined argv string) without spawning. |
| GET | `/api/processes/status` | All 7 process types' statuses at once. |
| GET | `/sse/processes` | Legacy SSE stream: status + log changes, 1s cadence. Used by the Dataset tab's inline pre-cache panels. |
| **WS** | **`/ws/processes/{proc_type}/logs`** | **Live log stream.** On connect, the server sends a `{type: "history", lines: [...]}` frame with the full current buffer. After that, each new stdout line arrives as `{type: "line", line: "..."}`. Purely server-push — clients don't send anything, just close to disconnect. Used by the Train tab's `Terminal` component via `useWebSocketLogs`. |
| POST | `/api/processes/pipeline/start` | Start a cache-then-train pipeline. Checks cache status, skips completed steps, runs remaining sequentially: cache_text → cache_latents → training. Returns `{ok, steps, skipped_text_cache, skipped_latent_cache}`. |
| POST | `/api/processes/pipeline/cancel` | Cancel the active pipeline (stops current step, prevents next). |
| GET | `/api/processes/pipeline/status` | Pipeline state: `{active, current_step, current_type, total_steps, step_names}`. |

Supported `proc_type` values: `cache_latents`, `cache_text`, `cache_dino`, `training`, `inference`, `slider_training`. (`merge_lora` is reserved as a slot in `ProcessManager` but no `build_merge_lora_cmd` exists yet — starting it returns `400 Unknown type: merge_lora`.)

#### Filesystem — [`routers/filesystem.py`](../src/ltx_ic_lora_trainer/webui/routers/filesystem.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/fs/cwd` | Server CWD |
| GET | `/api/fs/browse` | List directory contents (sorted) |
| GET | `/api/fs/exists` | Check if path exists + type |
| GET | `/api/fs/read-file` | Read text file |
| POST | `/api/fs/write-file` | Write text file (creates parents) |
| GET | `/api/fs/scan-checkpoints` | Scan common locations for LTX-2 / Gemma checkpoints |
| GET | `/api/fs/download-presets` | List download presets |
| POST | `/api/fs/download-model` | Download a model via `huggingface-cli` |

#### Metrics — [`routers/metrics.py`](../src/ltx_ic_lora_trainer/webui/routers/metrics.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/runs/current/metrics?since_step=N` | Return metric rows with `step > N` (JSONL slice) |
| GET | `/api/runs/current/status` | Read `status.json` (current run state) |
| GET | `/api/runs/current/events` | Read `events.jsonl` (sparse event log) |
| GET | `/api/runs/current/sse` | SSE stream: tail `metrics.jsonl` and emit each new row as a `metric` event |

All four read from `<run_dir>/dashboard/` where `run_dir` is the loaded project's training `output_dir`.

#### Samples — [`routers/samples.py`](../src/ltx_ic_lora_trainer/webui/routers/samples.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/samples/list` | All files under `<run_dir>/sample/`, sorted mtime desc |
| GET | `/api/samples/{path:path}` | Serve a sample file with path-traversal protection |
| GET | `/api/samples/checkpoints` | List all LoRA checkpoints in output_dir: `{checkpoints: [{filename, step, size_bytes, mtime, has_comfy, has_state, state_dir}]}` sorted by step. |

#### Stats — [`routers/stats.py`](../src/ltx_ic_lora_trainer/webui/routers/stats.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | Comprehensive project stats: `DatasetStats` (totals, resolutions, frame counts), `TrainingStats` (steps/epoch, ETA, storage estimates), `VRAMStats` (peak training/sampling VRAM with per-component breakdown) |

#### System — [`routers/system.py`](../src/ltx_ic_lora_trainer/webui/routers/system.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/system/info` | Hardware info: CPU model/cores, RAM total/used/free/pct, GPUs via `nvidia-smi` (name, VRAM, temperature, utilization), disk, OS, Python version |

The `collect_system_info()` function is extracted as a shared callable so both the HTTP endpoint and the WebSocket hub can use it.

#### Captions — [`routers/captions.py`](../src/ltx_ic_lora_trainer/webui/routers/captions.py)

| Method | Path | Description |
|---|---|---|
| GET | `/api/captions/assets?directory=...&caption_extension=.txt&limit=500&offset=0` | Scan dataset directory for media files, return `{directory, total, offset, assets: [{filename, type, size_bytes, has_caption}]}`. Pagination via `limit`+`offset`. |
| GET | `/api/captions/read?path=...` | Read caption file text. Returns `{content: ""}` if file does not exist. |
| POST | `/api/captions/write` | Body: `{path, content}`. Write caption text, creates parent dirs. Pushes `caption_saved` event through the WebSocket hub. |
| GET | `/api/captions/media/{file_path:path}?base_dir=...` | Serve raw media file from a dataset directory. Path-traversal protection via `realpath` containment check. |
| POST | `/api/captions/upload` | Multipart upload. Form fields: `directory`, `files` (multiple), `create_captions` (bool), `caption_extension`. Saves files to directory, creates blank caption files for media. |

### WebSocket hub — [`ws_hub.py`](../src/ltx_ic_lora_trainer/webui/ws_hub.py)

Multiplexed WebSocket endpoint at `/ws/hub`. Replaces per-concern HTTP polling with server push. Registered in `server.py`.

**Protocol:**
- Client connects, sends `{"subscribe": ["system", "process_status", "metrics"]}`.
- Server acknowledges `{"type": "subscribed", "channels": [...]}`.
- Server pushes `{"channel": "<name>", "data": {...}}` on each channel's cadence.

**Channels:**

| Channel | Cadence | Data shape |
|---|---|---|
| `system` | ~5 s | Same dict as `GET /api/system/info` |
| `process_status` | ~2 s | `{proc_type: {state, exit_code}, ...}` for all 7 process types |
| `metrics` | ~1 s (tails `metrics.jsonl`) | One metric row per push: `{step, epoch, loss, avr_loss, lr, ...}` |
| `caption_saved` | On-demand | `{path, ok}` — pushed when `POST /api/captions/write` succeeds |

**`HubManager` class:** initialised on `app.state.hub_manager`. Background `asyncio.Task`s produce data on timers. Per-client `asyncio.Queue` with size cap (256 frames); slow consumers drop frames. Disconnect cleanup via `finally` block.

The frontend's `useWebSocketHub` hook (in `hooks/useWebSocketHub.ts`) connects once at the Layout level and writes incoming data directly into TanStack Query's cache. HTTP polling on `useSystemInfo`, `useProcessStatus`, and `useMetrics` is kept as a slow fallback (15–30 s) in case the WebSocket is down.

### Project schema — [`project_schema.py`](../src/ltx_ic_lora_trainer/webui/project_schema.py)

Pydantic v2. The single source of truth for `project.json` layout. Top-level class is `ProjectConfig` with nested sections:

- **`GeneralConfig`** — `enable_bucket`, `bucket_no_upscale`
- **`DatasetConfig`** — `general` (GeneralConfig), `datasets` (list of `DatasetEntry`), `validation_datasets`
- **`CachingConfig`** — VAE/Gemma paths, tiling, quantisation, audio mode, DINOv2 batch size, connector LoRA flags
- **`TrainingConfig`** — model selection (LTX-2 version, mode), quantisation (fp8/nf4/AWQ), LoRA config (rank, target preset), learning, optimisation, training loop settings
- **`InferenceConfig`** — sampling knobs (guidance, num_videos, steps, etc.)
- **`SliderConfig`** — slider mode, guidance, sample range, targets (`list[SliderTargetConfig]`)

The top-level `ProjectConfig` itself carries `name` (default `"New Project"`) and the nested sections above. There is no separate `ProjectMetadata` class — name lives directly on `ProjectConfig`, and the project directory is tracked at the app-state level (see `server.py`'s `project_path`), not inside the schema.

**Methods:**
- `ProjectConfig.load(path: Path) → ProjectConfig` — deserialise project.json with validation
- `ProjectConfig.save(path: Path | None)` — serialise to JSON (atomic via temp file)

Any Pydantic model validators track enum constraints (e.g., `ltx2_mode ∈ {"video", "av", "audio"}`).

### Command builder — [`command_builder.py`](../src/ltx_ic_lora_trainer/webui/command_builder.py)

~960 lines. Takes a `ProjectConfig` and produces argv lists for every LTX-2 script. Public functions:

| Function | Builds CLI for |
|---|---|
| `build_cache_latents_cmd(config)` | `ltx2_cache_latents.py` |
| `build_cache_text_cmd(config)` | `ltx2_cache_text_encoder_outputs.py` |
| `build_cache_dino_cmd(config)` | `ltx2_cache_dino_features.py` |
| `build_training_cmd(config)` | `ltx2_train_network.py` (via `accelerate launch`; appends `--gui` so `metrics_writer` activates) |
| `build_inference_cmd(config)` | `ltx2_generate_video.py` |
| `build_slider_training_cmd(config)` | `ltx2_train_slider.py` (via `accelerate launch`) |

Each function reads the relevant section of `ProjectConfig` and produces a list of argv entries with conditional flags based on which features are enabled. **This is the definitive mapping between the project schema and the LTX-2 CLI surface.** If you add a new CLI flag to an LTX-2 script, you add a corresponding field to `project_schema.py` and a branch in the matching `build_*_cmd` function.

### Process manager — [`process_manager.py`](../src/ltx_ic_lora_trainer/webui/process_manager.py)

Thread-safe subprocess manager. Tracks up to 7 concurrent process types:

- `cache_latents`, `cache_text`, `cache_dino`, `training`, `inference`, `slider_training`, `merge_lora`

**States:** `IDLE`, `RUNNING`, `STOPPING`, `FINISHED`, `ERROR`.

**Windows specifics:**
- Spawns with `subprocess.CREATE_NEW_PROCESS_GROUP` so termination doesn't cascade to the parent
- Uses `CTRL_BREAK_EVENT` to stop cleanly (equivalent to the user pressing Ctrl+Break)
- Falls back to `terminate()` then `kill()` if the process doesn't respond within 10s

**Logging:** circular buffer (5000 lines max) per process, merged stdout/stderr.

**API:**
- `start(proc_type, cmd, cwd)` → spawn subprocess with pipes
- `stop(proc_type)` → graceful termination with fallback
- `get_status(proc_type)` → state + exit code
- `get_logs(proc_type, last_n=None)` → buffered output lines
- `get_all_statuses()` → status dict for all process types

### Metrics writer — [`metrics_writer.py`](../src/ltx_ic_lora_trainer/webui/metrics_writer.py)

Writes training telemetry as JSONL. Replaces the old Parquet-based writer (which required `pyarrow`). Called from [`base_trainer.py:1831-1837`](../src/ltx_ic_lora_trainer/base_trainer.py#L1831-L1837) via lazy import when `--gui` is passed.

Writes three files under `<run_dir>/dashboard/`:

| File | Format | Purpose |
|---|---|---|
| `metrics.jsonl` | append-only JSONL | One row per training step: `step`, `epoch`, `loss`, `avr_loss`, `loss_v`, `loss_a`, `lr`, `step_time` |
| `status.json` | last-write-wins JSON | Current run state: `step`, `max_steps`, `epoch`, `max_epochs`, `status`, `elapsed_sec`, `speed_steps_per_sec`, `time` |
| `events.jsonl` | append-only JSONL | Sparse event log: `type` (e.g., `checkpoint`, `sample`), `step`, `time`, plus extras |

**API:**
- `MetricsWriter(run_dir, flush_every=10)` — constructor
- `log(step, epoch, loss, avr_loss, loss_v, loss_a, lr, step_time)` — buffer a metric row; auto-flush every 10 rows in a background thread
- `log_event(event_type, step, **extra)` — append an event in a background thread
- `update_status(**kw)` — atomic `status.json` write in a background thread (includes elapsed + speed calculation)
- `flush()` / `close()`
- `create_metrics_writer(run_dir, flush_every=10)` — factory used by the base trainer's lazy import path

NumPy and torch scalars are converted to plain Python via a custom `default=` JSON encoder.

### TOML export — [`toml_export.py`](../src/ltx_ic_lora_trainer/webui/toml_export.py)

Serialises `DatasetConfig` → `dataset_config.toml` and `SliderConfig` → `slider_config.toml` so the LTX-2 cache / training scripts (which expect TOML) can consume the webui's project.json state.

Public functions:
- `export_dataset_toml(config: ProjectConfig) → Path`
- `build_dataset_toml_path(config) → Path`
- `_write_slider_toml(config, path) → Path`
- `build_slider_toml_path(config) → Path`

Uses `tomli_w` if available, otherwise falls back to a small hand-rolled string builder.

## Frontend

### Stack

Pinned via [`src/ltx_ic_lora_trainer/webui/frontend/package.json`](../src/ltx_ic_lora_trainer/webui/frontend/package.json):

| Dependency | Version | Purpose |
|---|---|---|
| `react`, `react-dom` | 19 | UI framework |
| `vite` | 6 | Build tool + dev server |
| `typescript` | 5 | Type checking |
| `@tanstack/react-router` | 1.95 | File-based routing |
| `@tanstack/react-query` | 5.62 | Server state + caching |
| `@tanstack/router-plugin` (dev) | 1.95 | Auto-generates `routeTree.gen.ts` |
| `zustand` | 5 | Client state with `persist` middleware |
| `react-hook-form` + `@hookform/resolvers` | 7.54 / 3.9 | Forms |
| `zod` | 3.24 | Schema validation |
| `tailwindcss` | 3.4 | Styling |
| `lucide-react` | 0.460 | Icon library |
| `recharts` | 2.13 | Charts for the training dashboard |
| `sonner` | 1.7 | Toast notifications |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | shadcn-style variants + class merging |
| `date-fns` | 4.1 | Date formatting |

### Routes — [`src/routes/`](../src/ltx_ic_lora_trainer/webui/frontend/src/routes/)

**2** file-based routes. The webui has been deliberately kept to two
top-level pages; do not add more without explicit user approval.

| File | Path | Purpose |
|---|---|---|
| `__root.tsx` | root layout | Wraps everything in `<Layout>` + `<Outlet>` |
| `index.tsx` | `/` (Data) | Dataset management. When no project is loaded, shows auto-discovered projects and manual load. When loaded, context panel shows `DatasetSidebar` (create/select/delete named datasets). Main area shows `DatasetWorkspace`: drag-and-drop upload toolbar, responsive media grid with target/reference pairs and inline caption editing, and a fixed right settings panel (resolution, batch, frames, etc.). Pre-caching is handled implicitly by the training pipeline — no separate caching UI. |
| `training.tsx` | `/training` (Train) | Training control + hyperparameters + checkpoints/samples. When idle: **HyperparameterPage** prominently visible + `StopEditResumeControls` (via `TrainingActionRail`). When running: 6 status cards, 3 Recharts charts, WebSocket-backed Terminal, accordion collapsed in a `<details>`. Below: **Checkpoints & Samples** section showing checkpoint groups with resume buttons and validation sample grids. Context panel shows run info (state, step, speed, elapsed) plus `HyperparameterSidebar` for quick navigation. |

### Components

**UI primitives** — [`src/components/ui/`](../src/ltx_ic_lora_trainer/webui/frontend/src/components/ui/)

Hand-written shadcn-style primitives. No `shadcn/ui` CLI — these are just 15 small files you can own and restyle.

| Component | Purpose |
|---|---|
| `button.tsx` | `Button` + `buttonVariants`; variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon |
| `input.tsx` | Text input |
| `label.tsx` | Form label |
| `textarea.tsx` | Multi-line text input (monospace) |
| `card.tsx` | `Card` + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` + `CardFooter` |
| `badge.tsx` | `Badge` with variants: default/secondary/destructive/outline/success/warning |
| `select.tsx` | Native `<select>` wrapped in design tokens |
| `switch.tsx` | Toggle switch (controlled via `checked` + `onCheckedChange`) |
| `tabs.tsx` | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` (context-based) |
| `accordion.tsx` | `Accordion` + `AccordionItem` + `AccordionTrigger` + `AccordionContent` with `type="single" \| "multiple"` |
| `separator.tsx` | Horizontal/vertical divider |
| `dialog.tsx` | Modal dialog (Radix-style API: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`) |
| `dropdown-menu.tsx` | Dropdown menu primitives |
| `tooltip.tsx` | Hover tooltip with `TooltipProvider` + `TooltipTrigger` + `TooltipContent` |
| `skeleton.tsx` | Loading skeleton placeholder block |

**Common components** — [`src/components/common/`](../src/ltx_ic_lora_trainer/webui/frontend/src/components/common/)

| Component | Purpose |
|---|---|
| `ProcessControls` | Compact Start/Stop row + state badge. Reads `ProcessStatus.state` from `/api/processes/{type}/status` (refetch 2s). Used on the Dataset tab's inline pre-cache panels. The Train tab uses `StopEditResumeControls` instead. |
| `ProcessConsole` | Polling log tail (HTTP `/api/processes/{type}/logs` every 1.5s). Still used on the Dataset pre-cache panels where low-cadence is fine. The Train tab uses the new **Terminal** component (WebSocket). |
| `CommandPreview` | Shows the exact argv that would be spawned. Calls `/api/processes/{type}/command-preview`. Copy-to-clipboard button. |

**Feature components — Project tab** ([`src/features/project/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/project/)):

| Component | Purpose |
|---|---|
| `HyperparameterPage` | Main training-config form. Wraps 8 section components in a shadcn Accordion (`type="multiple"`). One RHF form with the full project config as default values. AccordionContent unmounts when closed so RHF only tracks the currently-visible subset of the ~200-field TrainingConfig. Save button calls `useUpdateProject().mutateAsync`. |
| `HyperparameterSidebar` | Context-panel rendering of the section list. Quick-jump nav into the open accordion item; mirrors the section order on the main page. |
| `TrainingActionRail` | Sticky action rail surfacing Start / Stop / Pause / Resume controls plus pipeline (cache-then-train) status, alongside the form. |
| `Section` / `SubGroup` | Layout wrappers for the inside of each accordion section. |
| `FormFields` | TextField / TextAreaField / NumberField / SelectField / SwitchField. All bind to the ambient `useFormContext` so sections stay as dumb fragments. NumberField supports nullable (Pydantic Optional[int/float]) and integer vs float modes. |
| `sections/*` | 8 section files: Basic, LoRA, Optimizer, Schedule, Memory (quantisation + attention + compile), Sampling, Validation, ResearchFeatures (CREPA, Self-Flow, HFATO, preservation, TARP/DCR, audio loss balance, audio metrics, modality freezer, cross-task synergy, audio supervision). |

**Feature components — Dataset tab** ([`src/features/dataset/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/dataset/)):

| Component | Purpose |
|---|---|
| `DatasetEntryCard` | One dataset row. Type selector + target directory + reference directory (IC-LoRA) + cache dirs + resolution/batch/frames/captions + conditional video-only fields. Edits nested fields under a `name` prefix via the ambient RHF form, so the same component renders both training and validation datasets. |

**Feature components — Train tab** ([`src/features/train/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/train/)):

| Component | Purpose |
|---|---|
| `Terminal` | WebSocket-backed live log viewer. Subscribes via `useWebSocketLogs("training")`. Strips ANSI escapes, converts `\r` to `\n` (so tqdm progress bars become a readable stream), auto-scrolls to the bottom unless the user scrolls up, surfaces a "Jump to bottom" pill when paused. Shows connection dot (wifi / spinner / wifi-off) in the header. 10 000-line bounded ring buffer. |
| `StopEditResumeControls` | Three-button state machine: Start, Stop (calls `/pause` → graceful stop + state dir stash), Resume (calls `/resume` → relaunches with `--resume <dir>`). Disabled states cover all backend process states (idle, running, stopping, finished, error). Shows "saved state available" hint when the resume path is armed. |
| `Charts` | Three Recharts LineCharts: `LossChart` (loss + avr_loss), `LRChart` (lr), `ValidationLossChart` (events.jsonl filtered to `type === "validation"`). All downsample display data to ≤2000 points. |

**Layout components** — [`src/components/layout/`](../src/ltx_ic_lora_trainer/webui/frontend/src/components/layout/)

| Component | Purpose |
|---|---|
| `IconRail` | **2-item** icon-only nav rail (`w-14` = 56px). Icons: `Database` (Data), `GraduationCap` (Train). Active state: left border accent + bg highlight. Tooltip on hover. |
| `ContextPanel` | 224px-wide (`w-56`) slot-based detail panel. Renders whatever the active route provides via `ContextPanelContext`. Independent scroll. |
| `ContextPanelContext` | React context + `useSetContextPanel(content)` hook. Each route calls this to populate the context panel. Uses `useLayoutEffect` to avoid flash during transitions. |
| `Header` | Breadcrumb (`project_name / Page`) + `SystemStrip` + dark/light theme toggle. Height `h-10` (40px). |
| `SystemStrip` | Live icon-based telemetry strip rendered inside `Header`. Fed by the WebSocket hub (fallback: 30s HTTP poll). Shows RAM used/total + mini-bar, primary GPU name + utilization + VRAM mini-bar, GPU temperature, disk free. Threshold coloring: ≥70% amber, ≥90% red (temperature: ≥75°C amber, ≥85°C red). Responsive: hides temp + disk below `lg`, hides entire strip below `sm`. Secondary GPUs collapse to a `+N` badge with a tooltip listing them. Errors render a `WifiOff` icon. |
| `Layout` | Three-column shell: `IconRail` + `ContextPanel` + main column (`Header` + scrollable content). Mounts `useWebSocketHub()` for the entire app. Wraps children in `ContextPanelProvider`. |

**Feature components — Data tab** ([`src/features/data/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/data/)):

| Component | Purpose |
|---|---|
| `DatasetSidebar` | Context panel content for the Data page. Lists named datasets as clickable cards with type icons and delete buttons. Inline create form (name + type) at top. Selected index stored in `uiStore.selectedDatasetIndex`. |
| `DatasetList` | Card-based list of datasets in the loaded project (used inside `DatasetSidebar`). Surfaces dataset type, asset count, and active selection. |
| `DatasetWorkspace` | Main workspace when a dataset is selected. Flex layout: media grid (flex-1) + settings panel (w-72 right). |
| `DatasetToolbar` | Upload bar with drag-and-drop zone. Separate buttons for target and reference uploads. Search filter and asset count. |
| `MediaGrid` | Responsive CSS grid of `MediaTile` components. 1-3 columns responsive. Fetches assets via `useDatasetAssets`. |
| `MediaTile` | Single grid tile: target + reference media side-by-side (video hover-to-play, synced), inline caption textarea with auto-save on blur and Ctrl+S. Uses `GET /api/dataset/{index}/media/{path}` and `…/thumb/{path}` for serving. |
| `DatasetSettings` | Fixed right panel (w-72) with dataset-level settings: type, resolution, batch size, repeats, caption extension, video-only options. Own `FormProvider` instance; saves via `PUT /api/project`. |
| `ProjectLoadDialog` | Modal for loading a project by path or from the recent-projects list. Used from the empty-state on the Data page. |

**Feature components — shared** ([`src/features/captions/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/captions/)):

| Component | Purpose |
|---|---|
| `MediaPreview` | Renders `<video controls>`, `<img>`, or `<audio controls>` based on file type. Used as a shared utility. |
| `AssetBrowser` | Paginated list of media assets in a directory with caption-status badges. Drives selection inside the captions workflow. |
| `CaptionEditor` | Textarea editor for a caption file. Auto-saves on blur / Ctrl+S; uses `useSaveCaption()` and pushes a `caption_saved` event through the WebSocket hub. |

**Feature components — Validation** ([`src/features/validation/`](../src/ltx_ic_lora_trainer/webui/frontend/src/features/validation/)):

| Component | Purpose |
|---|---|
| `CheckpointList` | Lists checkpoints by step number with size, timestamp, and badges (resumable state dir, comfy variant). Used within the Train page's Checkpoints & Samples section. |

### Zustand stores — [`src/stores/`](../src/ltx_ic_lora_trainer/webui/frontend/src/stores/)

Both use the `persist` middleware to localStorage.

**`uiStore.ts`**:
- `theme: "light" | "dark"` (default `"dark"`; applied to `<html>` class on rehydrate)
- `setTheme(t)`, `toggleTheme()`
- `selectedDatasetIndex: number | null` — which dataset entry is active on the Data page
- `setSelectedDatasetIndex(i)`

**`projectStore.ts`**:
- `recentProjects: {path, name, lastOpened}[]` (max 20)
- `addRecent(p)` — push to front, evict duplicates by path
- `removeRecent(path)`
- `clearRecents()`

### API hooks — [`src/api/`](../src/ltx_ic_lora_trainer/webui/frontend/src/api/)

Typed TanStack Query hooks, one file per backend router.

**`client.ts`** — `ApiError` (custom error with status + body), `api.get/post/put/delete(url, body?)` wrapper with JSON serialization, error handling, and 204 support.

**`projects.ts`** — `useProject`, `useProjectSchema` (stale forever), `useCreateProject`, `useUpdateProject`, `useLoadProject`, `useCloseProject` (all mutations invalidate the project query), `useDiscoverProjects(root?)` (auto-scans server CWD for `project.json` files and dataset directories; staleTime 30s).

**`system.ts`** — `useSystemInfo` (fallback poll 30s; primary data from WS hub `system` channel).

**`processes.ts`** — `useProcessStatus(type)` (fallback poll 15s; primary data from WS hub `process_status` channel; returns `{state, exit_code, resume_state_dir}`), `useProcessCommandPreview(type)`, `useStartProcess(type)`, `useStopProcess(type)`, `usePauseProcess(type)`, `useResumeProcess(type)`. Pipeline hooks: `useStartPipeline()` (starts cache→train pipeline), `usePipelineStatus()` (polls pipeline state every 2s), `useCancelPipeline()`.

**`datasets.ts`** — `useCacheStatus()` — reports cache completeness per dataset entry (total assets, latent/text cached counts, needs flags). Used by `StopEditResumeControls` to decide whether to start a pipeline or direct training.

**`checkpoints.ts`** — `useCheckpoints()` — lists LoRA checkpoints in output_dir with step, size, state_dir availability. 30s refetch.

**`metrics.ts`** — `useMetrics(sinceStep)` (fallback poll 30s; primary data from WS hub `metrics` channel), `useRunStatus` (fallback poll 10s), `useRunEvents` (fallback poll 15s).

**`captions.ts`** — `useDatasetAssets(directory, captionExt)` (fetches asset list with caption status), `useCaptionContent(path)` (reads caption text), `useSaveCaption()` (mutation, invalidates caption queries on success).

**`filesystem.ts`** — `browseDir(path, showFiles?)` → `{path, entries, parent}`, `checkExists(path)`, `getCwd()`. Non-hook wrappers (called directly inside components).

**`samples.ts`** — `useSamples` (refetchInterval 10s).

### Build outputs

- **`dist/`** — gitignored. Build with `pnpm build` (3 seconds, produces `index.html` + one hashed JS + one hashed CSS under `dist/assets/`, ~825KB / ~240KB gzipped).
- **`node_modules/`** — gitignored, ~229MB.
- **`routeTree.gen.ts`** — **committed**. Auto-generated by the router plugin when you run `pnpm dev` or `pnpm build`. If you add a new file under `src/routes/`, this regenerates and you should commit the update.

## Known gaps / follow-ups

The 2-page layout covers the full training loop end to end: create named datasets → upload and caption media → configure hyperparameters → launch training (auto-caches first) with live WebSocket streaming and charts → stop and tweak → resume from checkpoint → browse validation samples. A few things are still follow-ups:

1. **No "New project" creation wizard** — the Data page auto-discovers `project.json` files via `GET /api/project/discover` and shows them as clickable cards. You can also load by path or from recent history. To create a new project, use `POST /api/project` with a JSON body, or write a `project.json` by hand.
2. **Training form is still curated, not auto-generated** — `features/project/sections/` exposes the commonly-edited fields per section (Basic, LoRA, Optimizer, Schedule, Memory, Sampling, Validation, ResearchFeatures). The full `TrainingConfig` has ~200 fields; a handful of niche knobs (e.g. Self-Flow's 25 temporal/patch-level parameters, rarely-edited CREPA block indices) are intentionally not exposed as form inputs. You can still edit them by hand in `project.json`, and the accordion's Save button round-trips unknown fields untouched.
3. **tqdm progress bars render as a stream of lines** — the terminal strips ANSI escapes and converts `\r` to `\n`, so tqdm's "rewrite in place" effect becomes "one line per update". Readable, just noisy.
4. **Zod schema + Pydantic drift test** — still a follow-up. Currently the frontend treats `project.config` as `Record<string, unknown>` with ad-hoc reads.
5. **No batch auto-captioning** — the Data page supports manual caption editing and file upload, but no automated caption generation (e.g. Florence-2). A future follow-up could add a "Run auto-caption" action.
6. **Inference and slider training are CLI-only** — users launch these via `python -m ltx_ic_lora_trainer.ltx2_generate_video` / `ltx2_train_slider` directly.

## Extending the webui

**Add a new CLI flag:** add the field to the relevant `project_schema.py` section → add the branch in `command_builder.py` → (optional) add an input on the relevant frontend page → update [training.md](training.md) or [research-features.md](research-features.md).

**Add a new backend endpoint:** add a route to the relevant file under `webui/routers/` → add a hook module under `webui/frontend/src/api/` → use it in a component. Update the endpoint table in this file.

**Add a new frontend page:** drop a new file under `webui/frontend/src/routes/` (the router plugin regenerates `routeTree.gen.ts` automatically on next `pnpm dev` or `pnpm build`) → add a link to `IconRail`'s `NAV` list → update the routes table in this file.

**Add a new UI primitive:** drop a new file under `components/ui/` following the existing pattern (forwardRef, `cn()` for classes, design tokens via CSS variables from `globals.css`). Avoid reaching for external component libraries — the primitives list is deliberately small.
