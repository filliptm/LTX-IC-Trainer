# Training pipeline

End-to-end guide to the LTX-2 training pipeline, from raw dataset to trained LoRA. Covers every entry-point script, the full argument surface, modes, and IC-LoRA strategies.

## Pipeline overview

```
┌─────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐    ┌────────────────────────┐
│  raw dataset    │ -> │ ltx2_cache_latents       │ -> │ ltx2_cache_text_encoder_ │ -> │ ltx2_train_network     │
│ (video/audio/   │    │ (VAE latents → .st cache)│    │ outputs                  │    │ (LoRA training)        │
│ image + captions)│   └──────────────────────────┘    │ (Gemma → .st cache)      │    │                        │
└─────────────────┘                ↑                    └──────────────────────────┘    └───────────┬────────────┘
                                   │                                                                 │
                  ┌────────────────┴───────────────┐                                                 │
                  │ ltx2_cache_dino_features       │                                                 v
                  │ (DINOv2 patch tokens; optional │                                    ┌────────────────────────┐
                  │  and only used by CREPA dino)  │                                    │   trained LoRA         │
                  └────────────────────────────────┘                                    │  (safetensors)         │
                                                                                        └───────────┬────────────┘
                                                                                                    │
                                                                              ┌─────────────────────┼──────────────────────┐
                                                                              │                     │                      │
                                                                              v                     v                      v
                                                                       ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
                                                                       │ ltx2_       │      │ ltx2_merge_  │      │ ltx2_merge_  │
                                                                       │ generate_   │      │ lora         │      │ lora_to_     │
                                                                       │ video       │      │ (LoRA → LoRA)│      │ model        │
                                                                       │ (inference) │      └──────────────┘      │ (LoRA →      │
                                                                       └─────────────┘                            │  base model) │
                                                                                                                  └──────────────┘
```

## Modes

Set via `--ltx2_mode` (or the legacy alias `--ltx_mode`). Accepts: `video`, `audio`, `av` (or single-letter `v`/`a`/`va`).

- **`video`** — classic text-to-video. Only video latents are produced. Audio tokens/modules are not loaded.
- **`audio`** — text-to-audio only. Pair with `--ltx2_audio_only_model` if your checkpoint is an audio-only variant.
- **`av`** — bimodal audio + video, with cross-modal attention between the two streams. Most research features and IC-LoRA strategies key off AV specifically.

Mode affects: text encoder output format (video-only vs. video + audio), transformer modules loaded, loss weighting (`--video_loss_weight`, `--audio_loss_weight`, `--audio_loss_balance_mode`), reference conditioning options, sampling path.

## IC-LoRA strategies

Set via `--ic_lora_strategy`. Values:

- **`auto`** (default) — infer from `--lora_target_preset` (`v2v` → `v2v` strategy, `audio_ref_only_ic` → same, `av_ic` → same, otherwise `none`). Backward-compatible.
- **`none`** — no reference conditioning; standard text-to-X training.
- **`v2v`** — video-to-video reference conditioning. Reference video latents are concatenated/inserted as conditioning context.
- **`audio_ref_only_ic`** — ID-LoRA-style audio reference conditioning. Requires AV or audio-only mode and audio reference presence. Inserts reference audio tokens.
- **`av_ic`** — combined audio + video reference conditioning. Requires `--ltx2_mode av`.

## LoRA target presets

Set via `--lora_target_preset`. See [architecture.md § `networks/lora_ltx2.py`](architecture.md#networkslora_ltx2py) for the per-preset module lists. High level:

| Preset | Covers |
|---|---|
| `t2v` (default) | All attention (Q/K/V/Out) across video, audio, cross-modal |
| `v2v` | Attention + FFN — more expressive, better for reference-based |
| `video_sa` | Video self-attention only |
| `video_sa_ff` | Video self-attention + FFN |
| `video_sa_ca_ff` | Video self-attention + cross-attention + FFN |
| `audio` | Audio attention + FFN + video→audio cross-modal |
| `audio_ref_only_ic` | Audio + both cross-modal directions (ID-LoRA style) |
| `av_ic` | Video + audio + cross-modal attention + both FFNs |
| `full` | Everything |

Add `--train_connectors` to also train the Gemma → video/audio context connector modules.

## Entry points

### 1. `ltx2_cache_latents.py` — VAE latent pre-caching

Encodes every item in your dataset with the VAE and writes the latents to safetensors alongside your source files. Training then loads these caches instead of re-encoding every epoch.

**Key flags:**
- `--dataset_config` (required) — TOML dataset configuration
- `--ltx2_checkpoint` (required) — LTX-2 checkpoint (the VAE is read from here)
- `--vae` (optional) — separate VAE path; defaults to `--ltx2_checkpoint` (useful to avoid loading the full 46GB base model just for VAE encoding)
- `--ltx2_mode` / `--ltx_mode` — `video` / `audio` / `av`; determines what is cached
- `--batch_size`, `--num_workers`, `--skip_existing`, `--keep_cache`
- VAE tiling: `--vae_tiling`, `--vae_chunk_size`, `--vae_spatial_tile_sample_min_size`, `--vae_temporal_tile_size`, `--vae_temporal_tile_overlap`
- `--precache_sample_latents` — also cache I2V / V2V / reference-audio conditioning latents for sample prompts (sample prompts are loaded via the shared `base_trainer.load_prompts`)

**What it caches:**
- **Video latents**: `[B, C, T/32, H/32, W/32]`
- **Audio latents**: `[B, C, T / LATENT_DOWNSAMPLE_FACTOR]`
- **First-frame latents** (for I2V) and **reference latents** (for V2V) — stored in the same cache file under distinct keys

Inputs supported: images (auto-padded to 1 frame), videos (variable frame count, padded to 8k+1), audio (WAV/MP3, duration-bucketed).

### 2. `ltx2_cache_text_encoder_outputs.py` — Gemma pre-caching

Encodes every caption in your dataset with the Gemma text encoder and writes per-caption embeddings + attention masks to safetensors.

**Key Gemma flags:**
- `--gemma_root` — directory with Gemma-2 weights (standard path)
- `--gemma_safetensors` — single Gemma safetensors file (alternative, e.g. fp8 variants from ComfyUI)
- `--gemma_load_in_8bit`, `--gemma_load_in_4bit` — bitsandbytes quantisation (CUDA only)
- `--gemma_bnb_4bit_quant_type` — `nf4` or `fp4`
- `--gemma_bnb_4bit_disable_double_quant`
- `--gemma_bnb_4bit_compute_dtype` — `auto` / `fp16` / `bf16` / `fp32`

**Precaching sample prompts** (so the training script doesn't need to load Gemma at all during sampling):

- `--precache_sample_prompts` — encode the sample prompts file too
- `--sample_prompts PATH` — path to sample prompt file
- `--sample_prompts_cache PATH` — output cache path; defaults to `<dataset_cache_dir>/ltx2_sample_prompts_cache.pt`
- `--precache_preservation_prompts` — also encode blank / DOP class prompts (when using preservation)
- `--preservation_prompts_cache PATH` — output path
- `--cache_before_connector` — also cache pre-connector Gemma features (needed when training with `--train_connectors`)

**Output safetensors keys:** `video_prompt_embeds` `[seq_len, dim]`, `audio_prompt_embeds` `[seq_len, dim]` (AV mode), `prompt_attention_mask` `[seq_len]`, and `video_features`/`audio_features` when `--cache_before_connector` is set.

### 3. `ltx2_cache_dino_features.py` — DINOv2 pre-caching (optional, CREPA only)

Loads a DINOv2 model (variant selected via `--dino_model`: `dinov2_vits14`/`vitb14`/`vitl14`/`vitg14`), preprocesses frames to 518×518, extracts patch tokens via `forward_features()`, and saves them as `*_ltx2_dino.safetensors` alongside the latent caches. At training time, CREPA's `dino` mode reads these directly with **zero VRAM from DINOv2**.

Only needed when you're running CREPA with `mode=dino`. Skip if you only care about video/audio training.

**Key flags:** `--dino_model`, `--dino_batch_size`, `--skip_existing`, `--device`.

### 4. `ltx2_train_network.py` — the main training script

The entry point for LoRA / LoHa / LoKr training. All flags come from [`ltx2_args.py`](../src/ltx_ic_lora_trainer/ltx2_args.py) plus the base parser in [`base_trainer.setup_parser_common`](../src/ltx_ic_lora_trainer/base_trainer.py).

**Approximate argument count:** ~138 LTX-2-specific flags + ~30 inherited from the base parser ≈ **~170 total**. Don't try to memorise them all; the webui's command preview (see [webui.md](webui.md)) serialises your project config into the exact command, and you can hand-edit from there.

#### Required flags

- `--ltx2_checkpoint` — base LTX-2 weights
- `--gemma_root` OR `--gemma_safetensors` — text encoder (only needed if not using `--use_precached_sample_prompts` + pre-cached dataset text encoder outputs)
- `--dataset_config` — dataset TOML
- `--output_dir`, `--output_name` — where to save checkpoints

#### Argument groups (roughly)

1. **Core paths** — `--ltx2_checkpoint`, `--gemma_root`, `--gemma_safetensors`, `--vae`, `--dataset_config`, `--output_dir`, `--output_name`
2. **Mode & version** — `--ltx2_mode`/`--ltx_mode`, `--ltx_version` (2.0 legacy vs 2.3 defaults), `--ltx_version_check_mode` (off/warn/error), `--ltx2_audio_only_model`
3. **LoRA** — `--network_module` (usually `networks.lora_ltx2`), `--network_dim`, `--network_alpha`, `--network_args`, `--network_dropout`, `--scale_weight_norms`, `--lora_target_preset`, `--train_connectors`, `--ic_lora_strategy`, IC-LoRA audio-reference options (`--audio_ref_use_negative_positions`, `--audio_ref_mask_cross_attention_to_reference`, `--audio_ref_mask_reference_from_text_attention`, `--audio_ref_identity_guidance_scale`)
4. **AV bimodal CFG** — `--av_bimodal_cfg`, `--av_bimodal_scale`
5. **Memory** — `--blocks_to_swap`, `--gradient_checkpointing`, `--mixed_precision`, `--split_attn_target`, `--split_attn_mode`, `--split_attn_chunk_size`, `--ffn_chunk_target`, `--ffn_chunk_size`, `--sample_with_offloading`, CUDA options (`--cuda_memory_fraction`, `--cuda_allow_tf32`, `--cuda_cudnn_benchmark`)
6. **Optimizer & LR** — `--optimizer_type`, `--optimizer_args`, `--learning_rate`, `--lr_scheduler`, `--lr_warmup_steps`, `--lr_decay_steps`, `--gradient_accumulation_steps`, `--max_grad_norm`; group LR via `--group_lr_warmup_args`
7. **Loss & schedule** — `--max_train_steps`, `--max_train_epochs`, `--timestep_sampling`, `--discrete_flow_shift`, `--weighting_scheme`, `--seed`
8. **Shifted logit-normal sampling** — `--shifted_logit_mode` (`legacy` / `stretched`), `--shifted_logit_eps`, `--shifted_logit_uniform_prob`, `--shifted_logit_shift`
9. **Audio handling** — `--separate_audio_buckets`, `--audio_bucket_strategy`, `--audio_bucket_interval`, `--video_loss_weight`, `--audio_loss_weight`, `--audio_loss_balance_mode` (`none`/`inv_freq`/`ema_mag`/`uncertainty`/`ogm_ge`), per-mode hyperparameters (`--audio_loss_balance_beta`, `--audio_loss_balance_eps`, `--audio_loss_balance_min`, `--audio_loss_balance_max`, `--audio_loss_balance_ema_init`, `--audio_loss_balance_target_ratio`, `--audio_loss_balance_ema_decay`, `--audio_loss_balance_uncertainty_lr`), `--ogm_ge_alpha`, `--ogm_ge_noise_std`, `--independent_audio_timestep`, `--audio_only_sequence_resolution`, `--audio_silence_regularizer*`, `--min_audio_batches_per_accum`, `--audio_batch_probability`, `--audio_supervision_mode` (`off`/`warn`/`error`) + thresholds
10. **First-frame conditioning (I2V)** — `--ltx2_first_frame_conditioning_p`
11. **Preview sampling** — `--sample_prompts`, `--height`, `--width`, `--sample_num_frames`, `--sample_every_n_steps`, `--sample_every_n_epochs`, `--sample_with_offloading`, `--precache_sample_prompts`, `--use_precached_sample_prompts`, `--sample_prompts_cache`, `--use_precached_sample_latents`, `--sample_latents_cache`, `--sample_disable_audio`, `--sample_audio_only`, `--sample_disable_flash_attn`, `--sample_i2v_token_timestep_mask`, `--sample_audio_subprocess`, `--sample_merge_audio`, `--sample_include_reference`, `--reference_downscale`, `--reference_frames`, `--sample_two_stage`, `--spatial_upsampler_path`, `--distilled_lora_path`, `--sample_stage2_steps`, `--sample_tiled_vae`, `--sample_vae_tile_size*`
12. **Checkpointing** — `--save_every_n_steps`, `--save_every_n_epochs`, `--save_state`, `--resume`, `--autoresume`, HuggingFace Hub upload flags
13. **Quantisation** — `--fp8_base`, `--fp8_scaled`, `--fp8_w8a8`, `--w8a8_mode`, `--fp8_upcast*`, `--nf4_base`, `--nf4_block_size`, `--loftq_init`, `--loftq_iters`, `--awq_calibration`, `--awq_alpha`, `--awq_num_batches`, `--quantize_device`
14. **LyCORIS** — `--lycoris_config`, `--init_lokr_norm`, `--lycoris_quantized_base_check_mode`
15. **Research features** — each is a separate flag; see [research-features.md](research-features.md). Short list: `--crepa` + `--crepa_args`, `--self_flow` + `--self_flow_args`, `--hfato` + `--hfato_args`, `--blank_preservation`, `--dop`, `--prior_divergence`, `--audio_dop`, `--tarp_enabled`, `--dcr_enabled`, `--audio_metrics_enabled`
16. **Logging** — `--logging_dir`, `--log_with` (`tensorboard`/`wandb`), `--log_prefix`, `--log_tracker_name`, `--log_tracker_config`, `--wandb_api_key`, `--log_timesteps_histogram`
17. **Metadata** — `--training_comment` and other SS metadata keys

### 5. `ltx2_train_slider.py` — slider LoRA training

Slider training learns a **bidirectional offset** in latent space: given pairs of `(positive, negative)` text prompts or reference latents, the LoRA encodes the direction between them. At inference time you dial the slider to shift output along that axis.

**Data classes:**

```python
@dataclass
class SliderTargetConfig:
    positive: str          # text prompt OR reference latent key
    negative: str          # text prompt OR reference latent key
    target_class: str = "" # optional class label (e.g., "person")
    weight: float = 1.0    # per-target loss weight

@dataclass
class SliderConfig:
    mode: str                    # "text" or "reference"
    reference_modality: str      # "video" or "audio" (reference mode only)
    targets: list[SliderTargetConfig]
    guidance_strength: float = 1.0
    frame_rate: int = 25
    sample_slider_range: list[float] = [-2.0, -1.0, 0.0, 1.0, 2.0]  # multipliers sampled during preview
    pos_cache_dir: str | None = None  # positive latent cache dir (reference mode)
    neg_cache_dir: str | None = None  # negative latent cache dir (reference mode)
    text_cache_dir: str | None = None # text encoder cache (defaults to pos_cache_dir)
```

You pass a TOML config via `--slider_config PATH`. Most training flags from the regular trainer apply.

### 6. `ltx2_generate_video.py` — inference

Standalone generator, independent of training. Loads a checkpoint + any LoRAs, generates samples, writes them to disk.

**Key flags:**

- **Model**: `--ltx2_checkpoint` (required), `--vae` (optional), `--gemma_root` / `--gemma_safetensors`
- **LoRA stacking**: `--lora_weight` (can be passed multiple times), `--lora_multiplier` (aligned scales), `--include_patterns` / `--exclude_patterns` for module filtering
- **Dimensions**: `--height`, `--width`, `--frame_count`, `--frame_rate`
- **Denoising**: `--sample_steps`, `--guidance_scale`, `--cfg_scale`, `--discrete_flow_shift`
- **Attention backend**: `--attn_mode` (`flash`/`flash3`/`torch`/`xformers`/`sdpa`), or the individual short-flags `--flash_attn` / `--flash3` / `--sdpa` / `--xformers`
- **Quantisation**: `--fp8_base`, `--fp8_scaled`, `--fp8_w8a8`, `--nf4_base`, `--nf4_block_size`, `--loftq_init`
- **Memory**: `--blocks_to_swap`, `--use_pinned_memory_for_block_swap`, `--sample_with_offloading`, `--sample_tiled_vae` + tile size flags
- **I2V / V2V**: `--sample_i2v_token_timestep_mask`, `--reference_downscale`, `--reference_frames`, `--sample_include_reference`
- **Audio (AV mode)**: `--sample_disable_audio`, `--sample_audio_only`, `--sample_merge_audio` (mux audio into the output `.mp4`)
- **Two-stage**: `--sample_two_stage`, `--spatial_upsampler_path`, `--distilled_lora_path`, `--sample_stage2_steps`
- **Precaching** (reuse from training): `--use_precached_sample_prompts`, `--sample_prompts_cache`, `--use_precached_sample_latents`, `--sample_latents_cache`

**Output**: writes PNG frames + MP4 video under `--output_dir` with `--output_name` prefix. With `--sample_merge_audio` you get `*_av.mp4` with baked-in audio. With `--sample_include_reference` the V2V reference is rendered side-by-side.

### 7. `ltx2_merge_lora.py` — LoRA → LoRA

Merges multiple LoRA files into a single combined LoRA. Useful for stacking styles or shipping a single file.

- **Inputs**: `--lora_weight` (multiple), `--lora_multiplier` (aligned scales)
- **Output**: `--save_merged_lora`
- **Method**: `--merge_method` (`concat` or `orthogonal` — SVD-based)
- **Orthogonal settings**: `--orthogonal_k_fraction`, `--orthogonal_rank_mode` (`sum`/`max`/`min`)
- **Format detection**: auto-detects `lora_A`/`lora_B` vs. `lora_down`/`lora_up`
- **Dtype**: `--dtype` (default `float32`, auto-promotes)

### 8. `ltx2_merge_lora_to_model.py` — LoRA → base model

Bakes one or more LoRAs into a base model checkpoint so you can distribute a pre-merged checkpoint that doesn't need the LoRA loader at inference time.

- **Inputs**: `--dit` (base model), `--lora_weight` (multiple), `--lora_multiplier`
- **Output**: `--save_merged_model`
- **Flags**: `--device`, `--audio_video`, `--audio_only` (variant selection)
- **Metadata**: preserves original metadata and adds `merged_loras`, `merged_multipliers` keys so you can see what went in

## Sampling internals: `ltx2_sampling.py` → `LTX2SamplingMixin`

The mixin that `LTX2NetworkTrainer` uses to override every HV sampling default. Key methods:

| Method | Purpose |
|---|---|
| `sample_images` | Main entry point. Handles precached embeddings, precached latents, reference loading, audio decoding, two-stage inference, output muxing. |
| `process_sample_prompts` | Parse sample prompt file (text / TOML / precached) |
| `_build_text_encoder` | Load Gemma (with quantisation support) |
| `_encode_prompt_text` | On-the-fly prompt encoding |
| `_load_precached_sample_prompts` | Load precached Gemma embeddings from `.pt` |
| `_load_precached_sample_latents` | Load precached I2V latents |
| `_load_audio_components` | Load audio decoder + vocoder (AV) |
| `_load_and_encode_v2v_reference` | Load and encode V2V reference videos |
| `_load_reference_for_output` | Load reference for side-by-side display |
| `_override_attention_function` / `_restore_attention_function` | Temporary attention backend override |
| `_apply_sample_defaults` | Apply training args as sample defaults |
| `_cleanup_text_encoder` / `_cleanup_cuda` | Memory cleanup between prompts |

Distinguishing features compared to upstream HV sampling:
- Replaces HV's VAE-based path with LTX-2's flow-matching `LTX2Inferencer`
- Handles AV (dual-modality) sample generation with separate video/audio latents
- Supports I2V / V2V reference conditioning (upstream HV doesn't)
- Can skip Gemma + VAE at training time entirely via precaching
- Decodes audio latents to WAV using audio decoder + vocoder
- Two-stage sampling: spatial upsampler + distilled LoRA refinement
- Bimodal CFG: special handling for AV cross-attention disabling

## Model loading: `ltx2_model_loading.py`

Public functions:

- **`detect_ltx2_dtype(model_path) → torch.dtype`** — inspects safetensors header to detect FP8 / floating-point dtype without loading tensors
- **`detect_ltx2_config(model_path) → dict`** — infers model architecture from tensor shapes (layer count, attention dim, caption channels, audio config). Detects audio-video vs. video-only from the presence of audio keys.
- **`infer_ltx_version_from_checkpoint_config(config) → (version, markers)`** — LTX 2.0 vs 2.3 detection using metadata markers: `cross_attention_adaln`, `vocoder.bwe`, audio connector keys, `caption_proj_before_connector`
- **`load_ltx2_model(model_path, device, ..., audio_video, audio_only_model) → LTX2Transformer`** — full loader with quantisation and optimisation options:
  - `model_path`, `device`, `load_device`, `torch_dtype`
  - `attn_mode` (`torch`/`flash`/`flash3`/`xformers`)
  - `audio_video` (LTXAV vs LTXV), `audio_only_model` (audio-only variant)
  - `split_attn_target` / `mode` / `chunk_size`
  - `ffn_chunk_target` / `size`
  - `fp8_*`, `nf4_*`, `loftq_*`, `awq_*` quantisation options

Re-exported for external use: `KEEP_FP8_HIGH_PRECISION_TOKENS` — tuple of module names excluded from FP8 quantisation (norms, projections, conditioning layers).

## Running from the command line

See [development.md § Running training](development.md#running-training) for concrete invocation examples.

## Running from the webui

See [webui.md](webui.md). The caching, training, inference, and slider pages all launch the same scripts via `ProcessManager` using argv built from the loaded `project.json` via `command_builder.py`. You can use the **command preview** on each page to see the exact argv that would be spawned, copy it, and run it manually if you'd rather.
