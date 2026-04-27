# Development

How to set up a dev environment, run things, lint, and contribute.

## Requirements

- **Python 3.10+** (pinned in [`pyproject.toml`](../pyproject.toml): `requires-python = ">=3.10"`)
- **CUDA-capable GPU** with a driver matching one of the CUDA extras: 12.4, 12.8, or 13.0
- **[uv](https://github.com/astral-sh/uv)** (recommended) or plain pip
- For the webui frontend: **Node 20+** and **pnpm 10+** (install via `corepack enable && corepack use pnpm@10`)

## Installation

### With uv (recommended)

Pick exactly one CUDA extra:

```bash
uv sync --extra cu128           # PyTorch 2.7+, CUDA 12.8
uv sync --extra cu124           # PyTorch 2.5+, CUDA 12.4
uv sync --extra cu130           # PyTorch 2.9+, CUDA 13.0
```

Add `--extra webui` to also install the FastAPI stack:

```bash
uv sync --extra cu128 --extra webui
```

### With pip

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Unix
pip install -e .[cu128,webui]
```

Make sure you've installed PyTorch matching your CUDA version separately if you go the pip route — the `[cu124]`/`[cu128]`/`[cu130]` extras in `pyproject.toml` point at the PyTorch wheels index.

### Build the webui frontend

Once after installing, plus whenever you edit anything under [`src/ltx_ic_lora_trainer/webui/frontend/src/`](../src/ltx_ic_lora_trainer/webui/frontend/src/):

```bash
cd src/ltx_ic_lora_trainer/webui/frontend
corepack enable
corepack use pnpm@10
pnpm install                  # one-time, ~11s
pnpm build                    # ~3s, produces dist/
```

**`dist/` is gitignored** — every clone needs to build once. **`node_modules/` is gitignored**.

## Running training

This project uses file-based command-line entry points. There are **no** `console_scripts` shortcuts; always use `python -m ltx_ic_lora_trainer.<module>`.

### Quick-start end-to-end

```bash
# 1. Pre-cache VAE latents
python -m ltx_ic_lora_trainer.ltx2_cache_latents \
    --dataset_config path/to/dataset.toml \
    --ltx2_checkpoint path/to/ltx2.safetensors

# 2. Pre-cache Gemma text encoder outputs
python -m ltx_ic_lora_trainer.ltx2_cache_text_encoder_outputs \
    --dataset_config path/to/dataset.toml \
    --gemma_root path/to/gemma

# 3. (Optional) Pre-cache DINOv2 features — only needed for CREPA dino mode
python -m ltx_ic_lora_trainer.ltx2_cache_dino_features \
    --dataset_config path/to/dataset.toml \
    --dino_model dinov2_vitl14

# 4. Train a LoRA
python -m ltx_ic_lora_trainer.ltx2_train_network \
    --dataset_config path/to/dataset.toml \
    --ltx2_checkpoint path/to/ltx2.safetensors \
    --gemma_root path/to/gemma \
    --output_dir output \
    --output_name my_lora \
    --network_module networks.lora_ltx2 \
    --network_dim 32 --network_alpha 16 \
    --learning_rate 1e-4 \
    --max_train_steps 2000

# 5. Generate samples with the trained LoRA
python -m ltx_ic_lora_trainer.ltx2_generate_video \
    --ltx2_checkpoint path/to/ltx2.safetensors \
    --lora_weight output/my_lora.safetensors \
    --sample_prompts prompts.txt
```

See [training.md](training.md) for the full argument surface, all three modes (video / audio / av), IC-LoRA strategies, LoRA target presets, and research feature flags.

### With accelerate (multi-GPU or mixed precision)

```bash
accelerate launch --mixed_precision bf16 -m ltx_ic_lora_trainer.ltx2_train_network ...
```

## Running the webui

```bash
python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860
```

Or double-click [`run.bat`](../run.bat) on Windows — it activates `.venv/` and launches the above.

**Dev mode** with Vite hot reload:

```bash
python -m ltx_ic_lora_trainer.webui --dev --port 7860 --dev-port 5173
```

See [webui.md](webui.md) for the full webui reference.

## Standalone helper scripts — [`scripts/`](../scripts/)

Scripts that operate on model files or datasets but aren't part of any user-facing workflow:

| Script | Purpose |
|---|---|
| [`scripts/extract_ltx2_vae.py`](../scripts/extract_ltx2_vae.py) | Extract the VAE weights from a full LTX-2 checkpoint into a standalone safetensors file (so you don't have to load the entire 46GB model just to run VAE encoding) |
| [`scripts/merge_dit_to_comfy.py`](../scripts/merge_dit_to_comfy.py) | Convert LTX-2 DiT weights to ComfyUI format |
| [`scripts/generate_beeble_captions.py`](../scripts/generate_beeble_captions.py) | Project-specific caption generator for the "beeble" dataset |
| [`scripts/preprocess_beeble.py`](../scripts/preprocess_beeble.py) | Project-specific preprocessor for the "beeble" dataset |

None of these are imported by the main package; they're standalone CLIs.

## Linting and formatting

The project uses **[ruff](https://github.com/astral-sh/ruff)** for both linting and formatting. Config is in [`pyproject.toml`](../pyproject.toml) under `[tool.ruff]`.

```bash
ruff check src/ltx_ic_lora_trainer              # lint
ruff check --fix src/ltx_ic_lora_trainer        # auto-fix trivial issues
ruff format src/ltx_ic_lora_trainer             # format
```

Per-file ignores live in `[tool.ruff.lint.per-file-ignores]`. Two pre-existing latent issues are silenced there:

- `networks/lora.py` F821 — an undefined `suffix` reference in a rarely-executed loraplus path. Pre-dates the strip-down.
- `networks/lycoris_extensions.py` F401 — an `import lycoris` inside a `try`/`except ImportError` that ruff's static analysis can't see is intentional.

`modules/scheduling_flow_match_discrete.py` has `ALL` ignored because it's vendored code with an external copyright header.

## Type checking the frontend

```bash
cd src/ltx_ic_lora_trainer/webui/frontend
pnpm typecheck                # tsc --noEmit (strict + noUncheckedIndexedAccess)
```

## Git conventions

Commit style follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code reorganisation without functional change
- `strip:` (this fork) removing code during the LTX-2-only reduction
- `U1-U16:` (this fork) webui rebuild phases (historical; the rebuild is done)
- `P1-P11:` (this fork) Python strip-down phases (historical; the strip-down is done)

Commits should be small and scoped. Always include a co-author trailer when committing from an AI assistant.

## Updating documentation

**When you change the code, update the docs in the same commit.** See the table in [docs/README.md](README.md) for the mapping between source areas and doc files. The rule is repeated in [CLAUDE.md](../CLAUDE.md) at the repo root as a hard contract for AI-assisted edits.

## Known issues

- **Windows `cp1252` encoding when capturing `--help` output**: pass `PYTHONIOENCODING=utf-8` to avoid `UnicodeEncodeError` on argparse help strings that contain Japanese characters.
- **`sageattention` is commented out** in `pyproject.toml` deps (line 17) — it's not installed by default. Uncomment and reinstall if you want to use the sageattention backend.

## Contributing

1. Fork or branch
2. Make your change
3. Update the relevant doc file(s) — see the mapping table in [docs/README.md](README.md)
4. Run `ruff check src/ltx_ic_lora_trainer` and fix any new findings
5. If touching the frontend, run `pnpm typecheck` and `pnpm build`
6. Commit with a Conventional Commits message
7. Open a PR
