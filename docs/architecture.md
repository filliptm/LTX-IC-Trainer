# Architecture

How the code is organised, what lives where, and which pieces depend on which.

## Dependency graph (high-level)

```
ltx2_train_network.py      ← user entry point (via ltx2_args.py)
    │
    ├── LTX2NetworkTrainer(LTX2SamplingMixin, NetworkTrainer)
    │       │
    │       ├── NetworkTrainer           (base_trainer.py)
    │       │     └── dataset/, networks/, modules/, utils/, optimizers/
    │       │
    │       └── LTX2SamplingMixin        (ltx2_sampling.py)
    │             ├── ltx2_model_loading.py (load_ltx2_model, detect_ltx2_{dtype,config})
    │             ├── ltx2_inference.py     (LTX2Inferencer, InferenceConfig)
    │             ├── ltx2_text_conditioning.py
    │             ├── ltx2_lycoris_runtime.py
    │             ├── ltx2_audio_preview.py
    │             └── ltx_2/               (LTX-2 model package)
    │                    ├── model/transformer/
    │                    ├── model/video_vae/
    │                    ├── model/audio_vae/
    │                    ├── model/upsampler/
    │                    ├── components/  (schedulers, guiders, noisers, patchifiers)
    │                    ├── conditioning/
    │                    ├── guidance/
    │                    ├── loader/
    │                    └── text_encoders/gemma/
    │
    └── optional research modules (lazy-imported when CLI flag is set)
          ├── crepa.py           (--crepa)
          ├── self_flow.py       (--self_flow)
          ├── hfato.py           (--hfato)
          ├── preservation.py    (--blank_preservation / --dop / --prior_divergence / --audio_dop)
          ├── tarp_dcr.py        (--use_tarp / --use_dcr via networks/lora_ltx2.py)
          ├── modality_freezer.py (via base_trainer)
          ├── cross_task_synergy.py (via base_trainer)
          ├── ogm_ge.py          (via base_trainer)
          ├── audio_supervision.py (top-level import in ltx2_train_network)
          ├── audio_metrics.py   (--audio_metrics_enabled)
          ├── audio_loss_balance.py (via base_trainer)
          ├── audio_io_utils.py  (via ltx2_cache_latents)
          └── audio_utils.py     (via ltx2_cache_latents, ltx2_sampling)
```

## Base trainer (`base_trainer.py`)

~4500 lines. Contains the generic training machinery that every Musubi Tuner derivative inherits from. Originally named `hv_train_network.py` upstream; renamed to `base_trainer.py` in this fork to reflect its role.

### The `NetworkTrainer` class

The base class LTX-2's trainer subclasses. Its key responsibilities:

- **Training loop orchestration** — `train(args)` drives everything: accelerator setup, dataset/sampler/dataloader construction, model loading via overridable `load_vae` / `load_transformer`, optimiser and LR scheduler creation, gradient accumulation, step/epoch iteration, checkpoint saving, sampling, logging, cleanup.
- **Overridable architecture hooks** — methods like `load_vae`, `load_transformer`, `call_dit`, `scale_shift_latents`, `sample_images`, `sample_image_inference`, `process_sample_prompts`, `do_inference`, `architecture`, `architecture_full_name`, `handle_model_specific_args`, `compile_transformer` are declared here but **not implemented** — the HV defaults were stripped out during the LTX-2-only reduction. LTX2's `LTX2NetworkTrainer` + `LTX2SamplingMixin` supply concrete implementations for all of them via Python's MRO.
- **Generic hooks** — `get_checkpoint_metadata`, `post_save_checkpoint_hook`, `_resolve_network_module`, `convert_weight_keys`, `load_network_weights`, `i2v_training`, `control_training` @properties — all generic, kept as-is.
- **Research-feature integration** — directly imports `modality_freezer.ModalityFreezer`, `cross_task_synergy.compute_cross_task_synergy_losses`, `ogm_ge.compute_ogm_ge_coefficients`, `audio_loss_balance.*`. These are wired into the training loop in `train()` and fire when their respective CLI flags are set.
- **Lazy webui metrics writer** — at `base_trainer.py:1831-1837`, when `--gui` is passed and on the main process, lazily imports `ltx_ic_lora_trainer.webui.metrics_writer.create_metrics_writer` and starts emitting `metrics.jsonl`, `status.json`, `events.jsonl` under `<output_dir>/dashboard/`. This is how the webui's training dashboard lights up during a run.

### Module-level helpers exported by `base_trainer.py`

LTX-2 entry points import these directly:

| Symbol | Purpose |
|---|---|
| `collator_class` | Batch collator for multi-process dataloading; unwraps `batch_size=1`, manages epoch state |
| `prepare_accelerator` | HuggingFace Accelerator init (DDP, mixed precision, TorchDynamo, logging backends) |
| `compute_loss_weighting_for_sd3` | SD3-style weighted diffusion loss |
| `load_prompts` | Load JSONL/JSON/text prompt lists |
| `should_sample_images` | Predicate: time to run inference sampling this step/epoch? |
| `clean_memory_on_device` | Aggressive GC + `torch.cuda.empty_cache()` |
| `read_config_from_file` | TOML/JSON dataset config parser |
| `setup_parser_common` | Shared CLI argument parser (training hyperparameters, model paths, logging, etc.) |
| `SS_METADATA_KEY_BASE_MODEL_VERSION`, `SS_METADATA_MINIMUM_KEYS` | Safetensors LoRA metadata key constants |

## LTX-2 entry points and subclass

### `ltx2_train_network.py` — `LTX2NetworkTrainer(LTX2SamplingMixin, NetworkTrainer)`

The concrete training class. Overrides everything HV-specific from the base and adds LTX-2 behaviour:

- **Latent normalisation** — default `mean=0, std=1`, overridable by VAE config.
- **Mode dispatch** — `video`/`audio`/`av` via `--ltx2_mode`; the mixin's sampling path and the trainer's loss path branch on this.
- **IC-LoRA strategies** — `IC_LORA_STRATEGIES = ("auto", "none", "v2v", "audio_ref_only_ic", "av_ic")`. Selects how reference conditioning is wired through LoRA.
- **Research feature state** — holds `self._crepa`, `self._self_flow`, `self._hfato_config`, `self._preservation_helper`, `self._audio_metrics`, `self._audio_supervision_state`, `self._tarp_enabled`, `self._dcr_enabled`. Each is `None`/`False` unless the corresponding CLI flag is set.
- **Top-level module-level imports** — `audio_supervision`, `cross_task_synergy` (through base), `modality_freezer` (through base), `ogm_ge` (through base), `networks.lora_ltx2`. CREPA, Self-Flow, HFATO, preservation, TARP/DCR are **lazy-imported inside `_setup_*` methods** so the training script doesn't pay their startup cost when they're off.

### `ltx2_sampling.py` — `LTX2SamplingMixin`

Provides the methods LTX2's trainer uses instead of HV defaults. See [training.md](training.md) for a full list; in brief:

- `sample_images` — main sampling entry point (handles precached embeddings, precached latents, reference loading, audio decoding, two-stage inference, output muxing)
- `process_sample_prompts` — parse text/TOML/precached prompt files
- `_build_text_encoder`, `_encode_prompt_text`, `_load_precached_sample_prompts`, `_load_precached_sample_latents`
- `_load_audio_components` (load audio decoder + vocoder for AV)
- `_load_and_encode_v2v_reference`, `_load_reference_for_output`
- `_override_attention_function`, `_restore_attention_function`
- `_apply_sample_defaults`, `_cleanup_text_encoder`, `_cleanup_cuda`

### `ltx2_args.py`

argparse definition for all LTX-2 training flags. `main()` parses, applies defaults, validates, and instantiates `LTX2NetworkTrainer().train(args)`. See [training.md](training.md) for the argument surface.

### Other `ltx2_*.py` files

- **`ltx2_train.py`** — alternative entry (simpler init path, legacy-compatible)
- **`ltx2_train_slider.py`** — slider LoRA trainer; builds `SliderConfig` from TOML, runs bidirectional pair training. See [training.md](training.md) § slider training.
- **`ltx2_cache_latents.py`** — VAE latent cache
- **`ltx2_cache_text_encoder_outputs.py`** — Gemma cache
- **`ltx2_cache_dino_features.py`** — DINOv2 patch token cache
- **`ltx2_generate_video.py`** — inference
- **`ltx2_merge_lora.py`** — LoRA → LoRA merge
- **`ltx2_merge_lora_to_model.py`** — LoRA → base model merge
- **`ltx2_inference.py`** — `LTX2Inferencer` + `InferenceConfig`
- **`ltx2_model_loading.py`** — `detect_ltx2_dtype`, `detect_ltx2_config`, `infer_ltx_version_from_checkpoint_config`, `load_ltx2_model`
- **`ltx2_lycoris_runtime.py`** — LyCORIS adapter runtime helpers (enable/disable for sampling, norm-based filtering)
- **`ltx2_quantize_model.py`** — post-hoc quantisation tool
- **`ltx2_audio_preview.py`** — audio decode for preview samples
- **`ltx2_text_conditioning.py`** — Gemma embedding / context preparation

## Dataset layer

### `dataset/config_utils.py`

`ConfigSanitizer` (voluptuous-based schema validator) + `BlueprintGenerator` (converts raw user config + CLI args into type-safe dataclass `Blueprint`, with fallback chain dataset-specific → general → CLI → defaults). Also `load_user_config` (TOML/JSON parser with deprecated-alias handling) and manifest save/load for cache-only (source-free) training.

### `dataset/image_video_dataset.py`

~3200 lines. The generic dataset layer that LTX-2 shares with upstream Musubi. Public surface:

- **`BaseDataset`** — abstract parent for all dataset types
- **`ImageDataset`** — single-frame image training with FramePack temporal window support
- **`VideoDataset`** — multi-frame video; frame extraction strategies (head/tail/random), stride, target frame selection
- **`AudioDataset`** — audio-only; per-sample bucketing (pad/truncate) with duration-based intervals
- **`ItemInfo`** — per-sample metadata (item key, caption, latent cache path, text encoder cache path, loss masks, etc.)
- **`BucketSelector`** — groups items by resolution/duration; yields batches of homogeneous shape to minimise padding
- **`ARCHITECTURE_LTX2 = "ltx2"`**, **`ARCHITECTURE_LTX2_FULL = "ltx2_v1"`** — architecture tag strings. Non-LTX-2 architecture constants are retained as harmless string literals (see the P5 commit in the strip-down history for why — removing them would cascade into `sai_model_spec.py`).
- **LTX-2 cache helpers**: `save_latent_cache_ltx2`, `save_text_encoder_output_cache_ltx2`, `save_text_encoder_output_cache_ltx2_official`
- **Generic cache helpers**: `save_latent_cache_common`, `save_text_encoder_output_cache_common`
- **Extensions**: `IMAGE_EXTENSIONS`, `VIDEO_EXTENSIONS`, `AUDIO_EXTENSIONS`

### `dataset/audio_quota_sampler.py`

Two samplers for audio-aware batching:

- **`AudioQuotaIndexSampler`** — enforces a minimum number of audio batches per gradient-accumulation window
- **`AudioProbabilityIndexSampler`** — draws from audio/non-audio index pools with a target probability
- Public functions: `build_audio_sampler`, `split_concat_indices_by_audio`, `sync_dataset_group_epoch_without_loading`

## Networks / LoRA

### `networks/lora_ltx2.py`

LTX-2's concrete LoRA implementation. Key pieces:

- **`LTX2_TARGET_REPLACE_MODULES = ["BasicAVTransformerBlock"]`** — the only default LoRA injection point
- **`LTX2_TARGET_REPLACE_MODULES_WITH_CONNECTOR`** — adds `_BasicTransformerBlock1D` when `--train_connectors` is set
- **`LTX2Wrapper`**, **`LTXAVModel`**, **`LTXVideoOnlyModel`** — model wrapper classes detected by `network_arch.detect_arch_config`
- **LoRA target presets** (selected via `--lora_target_preset`):
  - `t2v` (default) — all attention (Q, K, V, Out) across video, audio, and cross-modal
  - `v2v` — attention + FFN (more expressive for reference-based training)
  - `video_sa`, `video_sa_ff`, `video_sa_ca_ff` — video-only variants
  - `audio` — audio attention + FFN + video-to-audio cross-modal
  - `audio_ref_only_ic` — ID-LoRA-style (audio + both cross-modal directions)
  - `av_ic` — superset of all video + audio + cross-modal attention + both FFNs
  - `full` — everything
- Lazy import of `tarp_dcr` at function scope (`networks/lora_ltx2.py:518`) when TARP masks are needed

### `networks/lora.py`

The generic `LoRAModule` base class. Replaces the forward of `Linear` / `Conv2d` modules with a low-rank adaptation. Supports kaiming init, optional LoftQ pre-computed init, split_dims for multi-head QKV, dropout variants. LTX-2-agnostic.

### Other files in `networks/`

- **`loha.py`** — LoHa (Hadamard product) variant
- **`lokr.py`** — LoKr (Kronecker product) variant
- **`lycoris_extensions.py`** — LyCORIS helpers: perturbed-normal LoKR init, config-to-kwargs builder
- **`network_arch.py`** — `detect_arch_config(unet)`: auto-detects LTX-2 by looking for `LTX2Wrapper`/`LTXAVModel`/`LTXVideoOnlyModel` class names in the module tree; after the strip-down this function only recognises LTX-2
- **`network_config.py`** — LyCORIS-related runtime config
- **`optimizer_params_compat.py`** — `prepare_optimizer_params_compat` for optimiser parameter compatibility

## Quantisation + optimisation (`modules/`)

- **`nf4_optimization_utils.py`** — NF4 (4-bit NormalFloat) quantisation. Packs 4-bit indices into uint8, per-block absmax scaling, QLoRA-style training support, safetensors lazy-loading with on-the-fly dequantisation.
- **`fp8_optimization_utils.py`** — FP8 (E4M3 / E5M2) quantisation. Per-tensor or per-channel scales, monkey-patching for inference and safetensors loading.
- **`w8a8_optimization_utils.py`** — Int8 weight + activation quantisation. Saves ~32MB per linear layer in the autograd graph. Two modes: `int8` (per-token activation quant + `torch._int_mm`, SM 7.5+) and `fp8` (transient dequant, any FP8-capable GPU).
- **`loftq_init.py`** — LoftQ initialisation. SVD of the residual `W - dequant(Q(W))`, used to compensate NF4 quantisation error upfront. Better than random init for heavily-quantised base models.
- **`awq_calibration.py`** — AWQ (Activation-aware Weight Quantisation). Per-channel activation L2 norm calibration → column scaling.
- **`custom_offloading_utils.py`** — `Offloader` class: block-wise CPU ↔ GPU weight swapping with pinned memory, supports CPU/XPU/MPS device types.
- **`fp8_optimization_utils.py`** — FP8 inference + training helpers
- **`group_lr_scheduler.py`** — `GroupWarmupScheduler` for per-group LR warmup
- **`lr_schedulers.py`** — `RexLR` and related LR schedulers
- **`scheduling_flow_match_discrete.py`** — flow-match discrete scheduler (external, copyright header, kept via ruff exclude)
- **`attention.py`** — attention backend dispatch helpers
- **`adafactor_fused.py`** — fused Adafactor optimiser

## LTX-2 model package (`ltx_2/`)

The LTX-2 model code itself. Structure:

| Subdirectory | Purpose |
|---|---|
| `components/` | Schedulers, guiders, noisers, patchifiers, diffusion_steps |
| `conditioning/` | Text conditioning pipeline and modality/prompt types |
| `guidance/` | CFG-time perturbations |
| `loader/` | `sft_loader`, `single_gpu_model_builder`, `module_ops`, `primitives`, `kernels`, `registry`, `fuse_loras` |
| `model/transformer/` | The DiT core: `BasicAVTransformerBlock`, attention/FFN modules, modality routing, `fp8_device_utils`, block-level checkpointing, RoPE, AdaLN |
| `model/video_vae/` | Video VAE encoder/decoder (convolution, ops, normalisation, tiling, sampling, enums) |
| `model/audio_vae/` | Audio VAE encoder/decoder (causal conv2d, vocoder, downsample/upsample, resnet, attention) |
| `model/upsampler/` | Optional spatial upsampler for two-stage inference |
| `model/common/` | Shared building blocks (normalisation, etc.) |
| `text_encoders/gemma/` | Gemma-2 text encoder + `embeddings_connector` (projects text to video/audio context) + `feature_extractor` + `fp8_ops` + `tokenizer` |
| `env.py` | `apply_ltx2_tweaks()` — environment patches applied at import time |
| `tools.py`, `types.py`, `utils.py` | Miscellaneous helpers |
| `convert_lora_to_comfy.py` | Format conversion for ComfyUI compatibility |

## Audio modules

| File | Purpose |
|---|---|
| `audio_io_utils.py` | Normalise decoded audio to `[channels, samples]` layout from various decoder output formats |
| `audio_utils.py` | Pitch-preserving time-stretching via STFT phase vocoder |
| `audio_loss_balance.py` | Inverse-frequency / EMA-magnitude / uncertainty-weighting for AV loss balancing |
| `audio_metrics.py` | Per-step latent Fréchet, temporal coherence, periodic mel metrics, optional CLAP and AV onset alignment |
| `audio_supervision.py` | Supervision mode enforcement (off/warn/error); tracks fraction of supervised audio batches |

## Utils (`utils/`)

| File | Purpose |
|---|---|
| `safetensors_utils.py` | `MemoryEfficientSafeOpen`, `mem_eff_save_file` — memory-efficient safetensors reader/writer |
| `device_utils.py` | `clean_memory_on_device`, `synchronize_device` |
| `model_utils.py` | `str_to_dtype`, `dtype_to_str`, `compile_transformer` |
| `lora_utils.py` | `load_safetensors_with_lora_and_fp8` |
| `train_utils.py` | Training step helpers (checkpoint names, step counts, etc.) |
| `huggingface_utils.py` | HuggingFace Hub upload integration |
| `sai_model_spec.py` | Stability AI ModelSpec metadata builder |
| `image_utils.py` | Generic image helpers |
| `video_io.py` | `save_images_grid`, `save_videos_grid`, `setup_parser_compile`, `get_time_flag` — extracted from deleted `hv_generate_video.py` during the strip-down; has zero hunyuan coupling |

## Optimizers (`optimizers/`)

| File | Purpose |
|---|---|
| `automagic.py` | Automagic optimiser (adaptive LR + schedule) |
| `optimizer_utils.py` | Shared helpers (gradient scaling, parameter group building) |

## Webui (`webui/`)

See [webui.md](webui.md) for the full breakdown. Short version: FastAPI backend (`server.py`, 8 routers, 39 routes) + React/Vite frontend (`frontend/` with TanStack Router, TanStack Query, Zustand, Tailwind, Recharts). JSONL-based metrics (`metrics_writer.py`). Reads and writes `project.json` files via `project_schema.py` (Pydantic v2). Builds LTX-2 CLI commands from project config via `command_builder.py` (~960 lines).
