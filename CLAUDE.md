# CLAUDE.md

Contract for AI assistants (Claude Code, Codex, Gemini CLI, Cursor, etc.) working in this repository. Read this first.

**This project is the LTX-2 edition of [Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer) by kohya_ss.** A focused training toolkit for the [LTX-2](https://github.com/Lightricks/LTX-Video) video model — LoRA / LoHa / LoKr adapters, sliders, all three LTX-2 modes (video / audio / audio-video), and a suite of opt-in research features. Ships with a FastAPI + React/Vite webui at [src/ltx_ic_lora_trainer/webui/](src/ltx_ic_lora_trainer/webui/).

## This file is a router. The docs are the source of truth.

Before making a non-trivial change, read the relevant doc file. After making a change, update the doc in the same commit.

| Start at | For |
|---|---|
| [docs/README.md](docs/README.md) | Index; read this to find the right file |
| [docs/overview.md](docs/overview.md) | Project scope, folder layout, what's supported |
| [docs/architecture.md](docs/architecture.md) | How the code is organised, module responsibilities, dependency graph |
| [docs/training.md](docs/training.md) | Training pipeline end-to-end: caching, training, inference, merging, CLI flags, modes, IC-LoRA strategies |
| [docs/research-features.md](docs/research-features.md) | CREPA, Self-Flow, HFATO, preservation, TARP/DCR, modality freezer, cross-task synergy, OGM-GE, audio metrics, audio supervision, audio loss balance |
| [docs/webui.md](docs/webui.md) | FastAPI backend + React/Vite frontend: entry point, routers, project schema, command builder, metrics writer, frontend components, stores, API hooks |
| [docs/development.md](docs/development.md) | Installation, running training, running the webui, linting, contribution workflow, known issues |

## The recursive-update rule (hard contract)

**When you change the code, update the relevant documentation file(s) in the same commit.** Not "later." Stale documentation is worse than no documentation — it actively misleads the next reader.

You **must** update docs when you:
- Add or remove a CLI flag anywhere in `src/ltx_ic_lora_trainer/ltx2_*.py`
- Add or remove a module under `src/ltx_ic_lora_trainer/` (including `webui/`)
- Add or remove a research feature
- Change the Pydantic schema in [src/ltx_ic_lora_trainer/webui/project_schema.py](src/ltx_ic_lora_trainer/webui/project_schema.py)
- Add, remove, or change a backend route under [src/ltx_ic_lora_trainer/webui/routers/](src/ltx_ic_lora_trainer/webui/routers/) or a frontend route under [src/ltx_ic_lora_trainer/webui/frontend/src/routes/](src/ltx_ic_lora_trainer/webui/frontend/src/routes/)
- Add a new UI primitive or common component
- Change dependencies in [pyproject.toml](pyproject.toml) or [src/ltx_ic_lora_trainer/webui/frontend/package.json](src/ltx_ic_lora_trainer/webui/frontend/package.json)
- Change the install flow, dev workflow, or lint config
- Rename a file or directory
- Change the LTX-2 mode set, IC-LoRA strategy set, or LoRA target preset list

You **do not** need to update docs for bug fixes that don't change observable behaviour, internal variable renames, added docstrings on private functions, or pure refactors that don't change the public surface.

**Which file to update:**

| You changed… | Update… |
|---|---|
| Any `ltx2_*.py` entry point or CLI flag | [docs/training.md](docs/training.md) |
| A research feature module | [docs/research-features.md](docs/research-features.md) |
| `base_trainer.py`, `dataset/`, `networks/`, `modules/`, `ltx_2/`, `optimizers/`, `utils/` | [docs/architecture.md](docs/architecture.md) |
| Anything under `src/ltx_ic_lora_trainer/webui/` | [docs/webui.md](docs/webui.md) |
| `pyproject.toml` deps/extras, `run.bat`, `scripts/`, install flow, lint config | [docs/development.md](docs/development.md) |
| Top-level project description, scope, folder layout | [docs/overview.md](docs/overview.md) |

If a change touches multiple areas, update multiple files. If you added a new file, add it to the folder layout tree in [docs/overview.md](docs/overview.md). If unsure, err on the side of updating.

## Coding conventions

- **Python style**: PEP 8, 4-space indentation, line length ~132 (matching ruff config), `snake_case` for files/functions, `PascalCase` for classes
- **Type hints**: use them for public APIs; private helpers are optional
- **Docstrings**: short, describe args/returns for anything non-trivial
- **Testing**: there is no test suite. Don't create one unless explicitly asked. Don't add test dependencies.
- **No new abstractions for one-time operations.** Three similar lines of code beats a premature helper.
- **No unused feature flags, backwards-compat shims, or "in case we need it" code paths.** Minimum surface area. If a code path exists only because it used to matter, delete it.

## Forward-looking gotchas

These are things a future edit could plausibly break. They're called out here because they're not obvious from reading the code alone.

- **`sentencepiece` is required by the Gemma tokenizer** at [src/ltx_ic_lora_trainer/ltx_2/text_encoders/gemma/tokenizer.py:12](src/ltx_ic_lora_trainer/ltx_2/text_encoders/gemma/tokenizer.py#L12). Don't drop it from [pyproject.toml](pyproject.toml) during a dependency cleanup.
- **Windows subprocess handling** in [webui/process_manager.py](src/ltx_ic_lora_trainer/webui/process_manager.py) uses `CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT`. Do not "simplify" to plain `terminate()` — Windows needs the group + break event to stop training subprocesses cleanly.
- **The webui has exactly 2 pages: Data · Train.** Do not add new top-level routes without explicit user approval. If you find yourself wanting a third route, consider whether the functionality belongs inside an existing page first.
- **Pause/edit/resume training is checkpoint-based, not OS-level.** `POST /api/processes/training/pause` does a graceful subprocess stop and waits for `--save_state_on_train_end` to write the accelerator state directory. `/resume` rebuilds the training command and prepends `--resume <state_dir>`. There is no SIGSTOP/SIGCONT path — the training script has to be able to shut down cleanly and restart. `command_builder.build_training_cmd` unconditionally appends `--save_state_on_train_end` so this flow always works regardless of what the project config says.

## Running things

| Task | Command |
|---|---|
| Install | `uv sync --extra cu128 --extra webui` |
| Build webui frontend | `cd src/ltx_ic_lora_trainer/webui/frontend && pnpm install && pnpm build` |
| Launch webui | `python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860` (or `run.bat` on Windows) |
| Lint | `ruff check src/ltx_ic_lora_trainer` |
| Typecheck frontend | `cd src/ltx_ic_lora_trainer/webui/frontend && pnpm typecheck` |
| Train a LoRA | `python -m ltx_ic_lora_trainer.ltx2_train_network ...` — see [docs/training.md](docs/training.md) |

## Pre-existing issues you should NOT "fix"

These are documented in [docs/development.md § Known issues](docs/development.md#known-issues) and suppressed in the ruff config. Leave them alone unless the user specifically asks:

- [networks/lora.py:859](src/ltx_ic_lora_trainer/networks/lora.py#L859) F821 — undefined `suffix` in a rarely-executed loraplus path
- [networks/lycoris_extensions.py:195](src/ltx_ic_lora_trainer/networks/lycoris_extensions.py#L195) F401 — `import lycoris` inside a try/except that ruff's static analysis can't see
- [modules/scheduling_flow_match_discrete.py](src/ltx_ic_lora_trainer/modules/scheduling_flow_match_discrete.py) — vendored code with an external copyright header, ALL rules ignored
