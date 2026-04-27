# Overview

## What this project is

This repo is the **LTX-2 edition** of [Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer) by kohya_ss. It has been stripped down from a multi-model framework (Hunyuan Video, Wan, Flux, Flux-2, Flux Kontext, FramePack, Qwen Image, Kandinsky5, Z-Image, Hunyuan Video 1.5, and LTX-2) to **LTX-2 only**. The training infrastructure, research features, and dataset layer that LTX-2 needs were preserved; everything else was removed.

The resulting project does one thing: **train, fine-tune, and run LoRA / LoHa / LoKr adapters and sliders on LTX-2**, with full support for LTX-2's three modalities (video, audio, audio-video) and the research features kohya_ss and this fork's author built on top of it.

If you need Hunyuan, Wan, Flux, Qwen-Image, Kandinsky5, FramePack, Z-Image, or similar, use [upstream Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer). This fork will never add them back.

## What it supports

- **LoRA / LoHa / LoKr training** via [`ltx2_train_network`](../src/ltx_ic_lora_trainer/ltx2_train_network.py)
- **Slider training** (bidirectional pair training for directional LoRAs) via [`ltx2_train_slider`](../src/ltx_ic_lora_trainer/ltx2_train_slider.py)
- **Three LTX-2 modes**: `video` (text → video), `audio` (text → audio), `av` (text → audio+video with cross-modal attention)
- **IC-LoRA strategies**: `auto`, `none`, `v2v`, `audio_ref_only_ic`, `av_ic`
- **LoRA target presets**: `t2v`, `v2v`, `video_sa`, `video_sa_ff`, `video_sa_ca_ff`, `audio`, `audio_ref_only_ic`, `av_ic`, `full`
- **Pre-caching** pipelines for VAE latents, Gemma text encoder outputs, and DINOv2 features
- **Inference / sampling** via [`ltx2_generate_video`](../src/ltx_ic_lora_trainer/ltx2_generate_video.py) with two-stage upsampling, tiled VAE decode, AV muxing
- **LoRA merging** (LoRA → LoRA, LoRA → base model)
- **Quantisation**: FP8 (E4M3/E5M2), NF4, W8A8, LoftQ-initialised LoRA, AWQ calibration
- **Memory optimisation**: block-swap offloading, custom chunked attention, FFN chunking, tiled VAE
- **Research features** (all opt-in via CLI flags; see [research-features.md](research-features.md)): CREPA, Self-Flow distillation, HFATO, preservation (blank / DOP / prior divergence / audio DOP), TARP/DCR, modality freezer, cross-task synergy, OGM-GE gradient balancing, audio metrics, audio supervision monitoring
- **Audio-aware training**: inverse-frequency and EMA-magnitude audio loss balancing, audio quota sampler, audio silence regulariser, independent audio timesteps, synthetic-audio fallback
- **Logging**: TensorBoard (with timestep histograms), Weights & Biases
- **Web UI**: FastAPI + React/Vite control plane at [`src/ltx_ic_lora_trainer/webui/`](../src/ltx_ic_lora_trainer/webui/) — see [webui.md](webui.md)

## What it does NOT support

- Any other model family (Hunyuan, Wan, Flux, Qwen, Kandinsky, FramePack, Z-Image, etc.)
- Non-LoRA full fine-tuning paths that were specific to other models
- Windows-only Gradio UI (deleted with the old `gui/` folder)
- SvelteKit dashboard (deleted with the old `gui_dashboard/` folder)
- Parquet-based metrics (replaced with JSONL in the new webui)
- The auto-installer PowerShell script (deleted — use `uv sync` or `pip install -e .`)

## Folder layout

```
ltx-ic-lora-trainer/
├── CLAUDE.md                   # AI-assistant contract (read first if you're an LLM)
├── README.md                   # User-facing intro + quick start
├── pyproject.toml              # Python deps, optional extras (cu124/cu128/cu130/webui), ruff config
├── install.sh / install.bat    # One-shot installer (uv sync --extra cu128 --extra webui + pnpm build)
├── run.sh / run.bat            # Launcher for the webui (`python -m ltx_ic_lora_trainer.webui`)
├── projects/                   # App-managed projects directory (gitignored; created on first webui project)
├── .python-version             # uv / pyenv pin
├── .gitignore
├── docs/                       # ← you are here
│   ├── README.md               # Docs index
│   ├── overview.md
│   ├── architecture.md
│   ├── training.md
│   ├── research-features.md
│   ├── webui.md
│   └── development.md
├── scripts/                    # Standalone helper scripts (see development.md)
│   ├── extract_ltx2_vae.py
│   ├── generate_beeble_captions.py
│   ├── merge_dit_to_comfy.py
│   └── preprocess_beeble.py
├── src/ltx_ic_lora_trainer/
│   ├── base_trainer.py         # NetworkTrainer base class + shared training machinery
│   ├── ltx2_*.py               # LTX-2 entry points (train, cache, generate, merge, etc.)
│   ├── ltx2_args.py            # argparse definitions (~170 flags)
│   ├── ltx2_sampling.py        # LTX2SamplingMixin — overrides HV sampling defaults
│   ├── ltx2_model_loading.py   # detect_ltx2_{dtype,config}, load_ltx2_model
│   ├── ltx2_inference.py       # LTX2Inferencer + InferenceConfig
│   ├── ltx2_lycoris_runtime.py # LyCORIS adapter runtime helpers
│   ├── ltx2_quantize_model.py  # post-hoc quantisation utility
│   ├── ltx2_audio_preview.py   # audio decode for preview samples
│   ├── ltx2_text_conditioning.py
│   ├── ltx_2/                  # LTX-2 model package (transformer, video/audio VAEs, upsampler, etc.)
│   ├── audio_*.py              # audio_io_utils, audio_utils, audio_loss_balance, audio_metrics, audio_supervision
│   ├── crepa.py, self_flow.py, hfato.py, preservation.py, tarp_dcr.py,
│   │ modality_freezer.py, cross_task_synergy.py, ogm_ge.py     # research features
│   ├── cache_latents.py, cache_text_encoder_outputs.py          # generic cache helpers (LTX-2-safe)
│   ├── convert_lora.py                                          # LoRA format conversion
│   ├── dataset/                # BaseDataset/VideoDataset/AudioDataset, audio_quota_sampler, config_utils
│   ├── networks/               # lora_ltx2, lora (base), loha, lokr, lycoris_extensions, network_arch.py, network_config.py, optimizer_params_compat.py
│   ├── modules/                # nf4/fp8/w8a8 quant, loftq, awq, custom_offloading, group/lr schedulers, scheduling_flow_match_discrete
│   ├── optimizers/             # automagic, optimizer_utils
│   ├── utils/                  # safetensors_utils, device_utils, model_utils, lora_utils, train_utils,
│   │                           # huggingface_utils, sai_model_spec, image_utils, video_io
│   └── webui/                  # FastAPI backend + React/Vite frontend
│       ├── __main__.py         # python -m ltx_ic_lora_trainer.webui
│       ├── server.py           # create_app() factory + /ws/hub endpoint
│       ├── ws_hub.py           # multiplexed WebSocket hub (system, process, metrics, caption channels)
│       ├── command_builder.py  # ProjectConfig → argv for ltx2_*.py scripts (960 lines)
│       ├── project_schema.py   # Pydantic v2 config (521 lines)
│       ├── paths.py            # REPO_ROOT + PROJECTS_DIR — single home for app-managed paths
│       ├── process_manager.py  # subprocess mgr with Windows CTRL_BREAK_EVENT
│       ├── metrics_writer.py   # JSONL metrics writer
│       ├── toml_export.py      # dataset_config.toml / slider_config.toml serializer
│       ├── routers/            # captions (assets + upload), datasets (config + cache-status), filesystem, metrics, processes (+ pipeline), projects (+ discover + auto-populate), samples (+ checkpoints), stats, system
│       └── frontend/           # React + Vite + TypeScript app
│           ├── package.json
│           ├── vite.config.ts, tailwind.config.ts, tsconfig.json
│           └── src/            # components/{ui,common,layout}, features/{project,dataset,data,captions,train,validation}, routes (2: Data, Train), api, hooks, stores, lib, styles
```

## Attribution

The training infrastructure (`NetworkTrainer` base class, dataset pipeline, quantisation modules, LoRA implementation, metadata spec, sampling loop) was written by **kohya_ss** as part of upstream [Musubi Tuner](https://github.com/kohya-ss/ltx-ic-lora-trainer). This fork removes everything non-LTX-2 and layers LTX-2-specific entry points, research features, and the new webui on top.
