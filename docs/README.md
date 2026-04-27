# Documentation

Entry point for the LTX-2 edition of Musubi Tuner. Each file below has a single, narrow focus — read just the ones you need.

## Start here

- **[overview.md](overview.md)** — What this project is, what it supports, what it deliberately does NOT support, and how the tree is laid out. Read this first.
- **[development.md](development.md)** — Installation, running training from the command line, running the webui, linting, and contributor conventions.

## Training

- **[training.md](training.md)** — The LTX-2 training pipeline end-to-end. Entry points (`ltx2_cache_*.py`, `ltx2_train_network.py`, `ltx2_train_slider.py`, `ltx2_generate_video.py`, `ltx2_merge_lora*.py`), command-line surface, IC-LoRA strategies, modes (video/audio/av), sample prompt precaching.
- **[research-features.md](research-features.md)** — Optional, CLI-flag-gated research features that stack on top of training: CREPA, Self-Flow, HFATO, preservation (blank/DOP/prior/audio), TARP/DCR, modality freezer, cross-task synergy, OGM-GE, audio metrics, audio supervision.

## Codebase

- **[architecture.md](architecture.md)** — How the code is organised. Base trainer vs. LTX-2 subclass, dataset layer, LoRA networks, quantisation modules, the `ltx_2/` model package, audio modules, the webui package.

## UI

- **[webui.md](webui.md)** — The FastAPI backend + React/Vite frontend under `src/ltx_ic_lora_trainer/webui/`. Entry point, backend routers, project schema, metrics writer, command builder, frontend stack, routes, components, stores, API hooks, known gaps.

---

## Recursive-update rule

**When you change the code, update the docs in the same commit.** If you add a CLI flag, new file, new endpoint, new config field — find the section that describes it and update the text there. Stale documentation is worse than no documentation.

A non-exhaustive cheat-sheet for what belongs where:

| You changed… | Update… |
|---|---|
| Any `ltx2_*.py` entry point or CLI flag | [training.md](training.md) |
| A research feature (crepa, self_flow, hfato, preservation, tarp_dcr, modality_freezer, cross_task_synergy, ogm_ge, audio_metrics, audio_supervision) | [research-features.md](research-features.md) |
| `base_trainer.py`, `dataset/`, `networks/`, `modules/`, `ltx_2/`, `optimizers/`, `utils/` | [architecture.md](architecture.md) |
| Anything under `src/ltx_ic_lora_trainer/webui/` (backend or frontend) | [webui.md](webui.md) |
| `pyproject.toml` deps/extras, `run.bat`, `scripts/`, install flow, lint config | [development.md](development.md) |
| Top-level project description, license, scope, folder layout | [overview.md](overview.md) |

See [../CLAUDE.md](../CLAUDE.md) at the repo root for the contract that AI assistants must follow when editing this repo, including the docs-update rule.
