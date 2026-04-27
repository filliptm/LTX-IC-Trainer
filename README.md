# Musubi Tuner (LTX-2 Edition)

A training toolkit for [LTX-2](https://github.com/Lightricks/LTX-Video) built on the
Musubi Tuner framework by kohya_ss. This edition has been stripped down to focus
exclusively on LTX-2: LoRA / LoHa / LoKr training, slider training, audio-video
training, and a rich set of research features.

> Looking for Hunyuan, Wan, Flux, Qwen-Image, Kandinsky5, FramePack, Z-Image or
> similar? Use the upstream [Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer).

## Features

- **LoRA / LoHa / LoKr training** for LTX-2 via [ltx2_train_network.py](src/ltx_ic_lora_trainer/ltx2_train_network.py)
- **Slider training** via [ltx2_train_slider.py](src/ltx_ic_lora_trainer/ltx2_train_slider.py)
- **Audio / video / audio-video modes** with audio-aware bucketing, IC-LoRA strategies, and first-frame conditioning
- **Pre-caching** of VAE latents, Gemma text encoder outputs, and DINO features
- **Inference / sampling** via [ltx2_generate_video.py](src/ltx_ic_lora_trainer/ltx2_generate_video.py)
- **LoRA merging** via [ltx2_merge_lora.py](src/ltx_ic_lora_trainer/ltx2_merge_lora.py) and [ltx2_merge_lora_to_model.py](src/ltx_ic_lora_trainer/ltx2_merge_lora_to_model.py)
- **Research features** (all opt-in via CLI flags):
  - CREPA — contrastive representation alignment
  - Self-Flow distillation
  - HFATO — high-frequency audio token overlap
  - Preservation / DOP / prior divergence / blank preservation
  - TARP / DCR regularisation
  - Audio supervision and audio metrics
  - Modality freezer, cross-task synergy, OGM-GE gradient balancing
  - LoftQ LoRA initialisation, NF4 / FP8 / W8A8 quantisation
- **Web UI** at [src/ltx_ic_lora_trainer/webui/](src/ltx_ic_lora_trainer/webui/) — FastAPI backend + React/Vite frontend
- **TensorBoard / WandB logging** with per-modality metric breakdowns and timestep histograms

## Documentation

Full documentation lives in [docs/](docs/). Start at [docs/README.md](docs/README.md) for an index.

- [docs/overview.md](docs/overview.md) — project scope, folder layout, attribution
- [docs/architecture.md](docs/architecture.md) — how the code is organised
- [docs/training.md](docs/training.md) — end-to-end LTX-2 training pipeline and CLI surface
- [docs/research-features.md](docs/research-features.md) — CREPA, Self-Flow, HFATO, preservation, TARP/DCR, modality freezer, cross-task synergy, OGM-GE, audio metrics/supervision
- [docs/webui.md](docs/webui.md) — FastAPI backend + React/Vite frontend reference
- [docs/development.md](docs/development.md) — install, run training, run the webui, lint, contribute

AI assistants should read [CLAUDE.md](CLAUDE.md) at the repo root first — it contains the contract for documentation updates and scope guardrails.

## Installation

This project uses [uv](https://github.com/astral-sh/uv) for dependency management.
Pick the CUDA variant matching your GPU driver:

```bash
uv sync --extra cu128          # CUDA 12.8 / PyTorch 2.7+
uv sync --extra cu124          # CUDA 12.4 / PyTorch 2.5+
uv sync --extra cu130          # CUDA 13.0 / PyTorch 2.9+
```

For the web UI, also install the `webui` extra:

```bash
uv sync --extra cu128 --extra webui
```

Then build the frontend once:

```bash
cd src/ltx_ic_lora_trainer/webui/frontend
corepack enable
pnpm install
pnpm build
```

## Quick start

```bash
# 1. Pre-cache latents
python -m ltx_ic_lora_trainer.ltx2_cache_latents \
    --dataset_config path/to/dataset.toml \
    --ltx2_checkpoint path/to/ltx2.safetensors

# 2. Pre-cache Gemma text encoder outputs
python -m ltx_ic_lora_trainer.ltx2_cache_text_encoder_outputs \
    --dataset_config path/to/dataset.toml \
    --gemma_root path/to/gemma

# 3. Train a LoRA
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

# 4. Generate samples
python -m ltx_ic_lora_trainer.ltx2_generate_video \
    --ltx2_checkpoint path/to/ltx2.safetensors \
    --lora_weight output/my_lora.safetensors
```

For the web UI:

```bash
python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860
```

See [docs/training.md](docs/training.md) for the full training reference and [docs/webui.md](docs/webui.md) for the webui.

## Attribution

This project is a fork of [Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer)
by kohya_ss. The original multi-model toolkit has been reduced to the LTX-2
pipeline only; credit for the training infrastructure belongs to kohya_ss and
the Musubi Tuner contributors.

## License

See [LICENSE](LICENSE) if present, otherwise defer to the upstream Musubi Tuner
license.
