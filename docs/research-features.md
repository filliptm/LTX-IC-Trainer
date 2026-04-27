# Research features

All the optional, CLI-gated research techniques that stack on top of LTX-2 training. Each is implemented in a single Python module under `src/ltx_ic_lora_trainer/` and turned on by a dedicated flag (or, in some cases, by setting a loss weight above zero). When the flag is off, the module is not loaded and has zero runtime or startup cost.

These are the "extra" losses and training tricks this fork layers on top of the base LTX-2 training loop. None of them are required for a vanilla LoRA run.

## CREPA — cross-frame representation alignment

**File:** [src/ltx_ic_lora_trainer/crepa.py](../src/ltx_ic_lora_trainer/crepa.py)
**Flag:** `--crepa` + `--crepa_args key=value ...`
**Imports from:** lazy, inside `LTX2NetworkTrainer._setup_crepa`

Training-time contrastive regularisation for temporal consistency. Learns an alignment between video features at different diffusion timesteps / frames and a frozen teacher signal.

**Two modes**, selected via `--crepa_args mode=...`:

- **`backbone`** — teacher is a deeper transformer block of the same model (SimpleTuner-style). No extra model needed; uses the base transformer as its own teacher.
- **`dino`** — teacher is pre-cached DINOv2 patch tokens (from [`ltx2_cache_dino_features.py`](../src/ltx_ic_lora_trainer/ltx2_cache_dino_features.py)). **Zero VRAM overhead** because DINOv2 is never loaded at training time; features are read from `*_ltx2_dino.safetensors` alongside the latent cache.

Only the projector MLP is trained; all other modules are frozen. Trained state is saved alongside the LoRA (`crepa_projector.safetensors`) and auto-loaded on `--resume`.

**Example:**
```
--crepa --crepa_args mode=dino dino_model=dinov2_vitl14 lambda_crepa=0.05 tau=0.07
```

See the module for the full args list.

## Self-Flow — feature distillation

**File:** [src/ltx_ic_lora_trainer/self_flow.py](../src/ltx_ic_lora_trainer/self_flow.py)
**Flag:** `--self_flow` + `--self_flow_args key=value ...`
**Imports from:** lazy, inside `LTX2NetworkTrainer._setup_self_flow`

Feature alignment loss between student and teacher at two transformer blocks, with dual-timestep noising (student forward at one noise level, teacher at another). Supports temporal neighbour weighting and optional random token dropout.

**Teacher modes** (`teacher_mode=`):
- **`base`** — frozen base model, no extra VRAM
- **`ema`** — EMA-smoothed LoRA weights (adds one shadow copy of LoRA params)
- **`partial_ema`** — blend of the two

Extra options:
- **Dual timestep** (`dual_timestep=true`) — student and teacher sample different timesteps independently
- **Frame-level mask** (`frame_level_mask=true`) — mask whole frames instead of tokens
- **Tokenwise timestep** (`tokenwise_timestep=true`) — per-token timesteps instead of per-batch
- **Temporal mode** (`temporal_mode=frame` / `window`)
- **Motion weighting** — upweight loss on tokens with higher temporal variance
- **Mask ratio** (`mask_ratio=0.1`)

State saved: `self_flow_projector.safetensors`, `self_flow_teacher_ema.safetensors` (if EMA).

Only supported in `--ltx_mode video` or `--ltx_mode av` (video branch of AV).

**Example:**
```
--self_flow --self_flow_args lambda_self_flow=0.1 temporal_mode=frame teacher_mode=base dual_timestep=true
```

## HFATO — high-frequency detail recovery

**File:** [src/ltx_ic_lora_trainer/hfato.py](../src/ltx_ic_lora_trainer/hfato.py)
**Flag:** `--hfato` + `--hfato_args key=value ...`
**Imports from:** lazy, inside `LTX2NetworkTrainer._setup_hfato`

"High-Frequency Awareness Training Objective" (also sometimes called ViBe). Degrades clean latents via a downsample-upsample pass that destroys high frequencies, then supervises the model to reconstruct the original clean latents. The loss is added on top of standard flow-matching loss.

Incompatible with `--ic_lora_strategy v2v` / `--ic_lora_strategy ref_latents` — the v2v / reference-latents path already uses standard loss and HFATO's objective doesn't make sense there.

**Example:**
```
--hfato --hfato_args scale_factor=0.5 interpolation=bilinear probability=1.0
```

## Preservation — blank / DOP / prior divergence / audio DOP

**File:** [src/ltx_ic_lora_trainer/preservation.py](../src/ltx_ic_lora_trainer/preservation.py)
**Flags:** `--blank_preservation`, `--dop`, `--prior_divergence`, `--audio_dop`, each with its own `--*_args key=value ...`
**Imports from:** lazy, inside `LTX2NetworkTrainer._setup_preservation`

Four distinct regularisation techniques all implemented in the same module:

1. **Blank Preservation (`--blank_preservation`)** — regularise LoRA to not change the model's output for a blank prompt. Prevents "forgetting" the base model's prior.
2. **DOP — Differential Output Preservation (`--dop`)** — same idea but for a class prompt (e.g., "a person"). Keeps the model's behaviour on a specific class consistent with the base model, while allowing the training distribution to steer it. Requires `--dop_args` including `class_prompt="..."`. Warns if `class_prompt` is blank (then DOP degenerates into blank preservation).
3. **Prior Divergence (`--prior_divergence`)** — encourage the LoRA-modified output to diverge from the base model output on training prompts (the opposite direction of DOP).
4. **Audio DOP (`--audio_dop`)** — DOP for audio modality in AV training.

All four share a `PreservationHelper` that does the paired forward pass against the base model and computes the auxiliary loss. The helper is only instantiated if at least one flag is set.

**Example:**
```
--blank_preservation --blank_preservation_args lambda=0.1 multiplier=1.0 \
--dop --dop_args class_prompt="a person" lambda=0.2
```

## TARP / DCR — audio-video cross-attention mask

**File:** [src/ltx_ic_lora_trainer/tarp_dcr.py](../src/ltx_ic_lora_trainer/tarp_dcr.py)
**Flags:** `--tarp` + `--tarp_args`, `--dcr` + `--dcr_args` (also wired via [`networks/lora_ltx2.py`](../src/ltx_ic_lora_trainer/networks/lora_ltx2.py))
**Imports from:** lazy, inside [`networks/lora_ltx2.py:518`](../src/ltx_ic_lora_trainer/networks/lora_ltx2.py#L518) and `LTX2NetworkTrainer._setup_tarp_dcr`

Two related techniques from **"Improving Joint Audio-Video Generation with Cross-Modal Context Learning"**:

- **TARP — Temporally Aligned RoPE Partitioning.** A windowed cross-attention mask that restricts each video frame to nearby audio tokens (and vice versa). Computed as an additive attention mask with `0.0` for attend and `-inf` for block; separate A→V and V→A masks. Configured via `--tarp_args window_multiplier=...`.
- **DCR — Dynamic Context Routing.** Per-sample gradient detachment for mixed audio/video batches. Configured via `--dcr_args reference_detach=...`.

Both are AV-only.

**Example:**
```
--tarp --tarp_args window_multiplier=3 --dcr
```

## Modality freezer

**File:** [src/ltx_ic_lora_trainer/modality_freezer.py](../src/ltx_ic_lora_trainer/modality_freezer.py)
**Flags:** `--modality_freeze_check_interval`, `--modality_freeze_ratio_threshold`, `--modality_freeze_warmup_steps`, `--modality_freeze_ema_decay`
**Imports from:** top-level in `base_trainer.py`

"Sequential Modality Prioritization" (G2D-style). Monitors per-modality loss EMA during AV training. When one modality's loss is learning substantially faster than the other (ratio crosses `--modality_freeze_ratio_threshold`, default 0.5), the LoRA parameters for the dominant modality are **frozen** so the lagging modality can catch up without gradient interference.

Warms up for `--modality_freeze_warmup_steps` (default 100) before activating. EMA decay controlled by `--modality_freeze_ema_decay` (default 0.99).

Off by default — the disable knob is `--modality_freeze_check_interval` (default 0; set to a positive integer to enable and check every N steps).

## Cross-task synergy

**File:** [src/ltx_ic_lora_trainer/cross_task_synergy.py](../src/ltx_ic_lora_trainer/cross_task_synergy.py)
**Flags:** `--cts_lambda_video_driven`, `--cts_lambda_audio_driven`
**Imports from:** top-level in `base_trainer.py`

From **Harmony (2025)**. Adds auxiliary uni-directional denoising losses: one modality is held clean (timestep=0) while the other is noisy, then the model is asked to denoise. This provides a more stable cross-modal alignment signal than training on fully-noisy pairs, because one side always carries ground truth.

Two directions:
- **Video-driven** (`--cts_lambda_video_driven 0.1`) — video is clean, model denoises audio conditioned on it
- **Audio-driven** (`--cts_lambda_audio_driven 0.3`) — audio is clean, model denoises video conditioned on it

Both default to 0 (off).

## OGM-GE — gradient magnitude balancing

**File:** [src/ltx_ic_lora_trainer/ogm_ge.py](../src/ltx_ic_lora_trainer/ogm_ge.py)
**Flags:** `--audio_loss_balance_mode=ogm_ge`, `--ogm_ge_alpha`, `--ogm_ge_noise_std`
**Imports from:** top-level in `base_trainer.py`

"Orthogonal Gradient Mapping — Gradient Elimination". Computes an attenuation coefficient per modality and applies it to that modality's gradients. The faster-learning (lower-loss) modality gets its gradients shrunk; the weaker modality stays at full scale. Optionally injects Gaussian noise into the attenuated gradients (`--ogm_ge_noise_std`) for a regularising effect.

Activated by selecting `ogm_ge` as the audio loss balance mode: `--audio_loss_balance_mode ogm_ge`.

## Audio metrics

**File:** [src/ltx_ic_lora_trainer/audio_metrics.py](../src/ltx_ic_lora_trainer/audio_metrics.py)
**Flag:** `--audio_metrics` + `--audio_metrics_args key=value ...`
**Imports from:** lazy, inside `LTX2NetworkTrainer._setup_audio_metrics`

Audio-quality metrics logged to the training tracker:
- Per-step: latent Fréchet distance, temporal coherence
- Periodic (every N steps): mel-space metrics — spectral convergence, MCD, log-spectral distance
- Optional sampling-time: CLAP similarity, AV onset alignment

All metrics are logged to TensorBoard/W&B via the accelerator's logging backend.

## Audio supervision monitoring

**File:** [src/ltx_ic_lora_trainer/audio_supervision.py](../src/ltx_ic_lora_trainer/audio_supervision.py)
**Flag:** `--audio_supervision_mode` (`off` / `warn` / `error`) + thresholds
**Imports from:** top-level in `ltx2_train_network.py` (**not** lazy — always loaded)

Tracks the fraction of audio batches that are actually "supervised" (contain real audio vs. synthetic / silent fallback) during AV training. Enforces a minimum supervision ratio:

- `off` — no monitoring
- `warn` — log a warning when the supervision ratio dips below the threshold
- `error` — raise an error, halting training

Helps catch dataset loading issues where your AV dataset is accidentally producing silent audio.

## Audio loss balance

**File:** [src/ltx_ic_lora_trainer/audio_loss_balance.py](../src/ltx_ic_lora_trainer/audio_loss_balance.py)
**Flag:** `--audio_loss_balance_mode` + per-mode hyperparameters
**Imports from:** top-level in `base_trainer.py`

Dynamic weighting of video/audio loss contributions during AV training. Four modes, selected via `--audio_loss_balance_mode`:

- **`none`** (default) — static weighting via `--video_loss_weight` / `--audio_loss_weight`
- **`inv_freq`** — inversely proportional to how often audio batches appear in the sampler. If audio is undersampled, its loss is upweighted. Uses an EMA of audio batch frequency controlled by `--audio_loss_balance_beta`.
- **`ema_mag`** — matches audio and video loss magnitudes to a target ratio (`--audio_loss_balance_target_ratio`) via EMA tracking (`--audio_loss_balance_ema_decay`).
- **`uncertainty`** — learned per-modality log-variance weights (Kendall et al.). Each modality has its own uncertainty parameter trained with a dedicated LR (`--uncertainty_lr`).
- **`ogm_ge`** — gradient magnitude balancing (see OGM-GE section above).

Guard rails: `--audio_loss_balance_min`, `--audio_loss_balance_max`, `--audio_loss_balance_eps`, `--audio_loss_balance_ema_init`.

## Interaction matrix

Not every research feature can be combined with every mode:

| Feature | video | audio | av |
|---|---|---|---|
| CREPA (backbone) | ✓ | ✓ | ✓ |
| CREPA (dino) | ✓ | — | ✓ (video branch) |
| Self-Flow | ✓ | — | ✓ (video branch) |
| HFATO | ✓ | ✓ | ✓ |
| Preservation (blank/DOP/prior) | ✓ | ✓ | ✓ |
| Audio DOP | — | ✓ | ✓ |
| TARP/DCR | — | — | ✓ |
| Modality freezer | — | — | ✓ |
| Cross-task synergy | — | — | ✓ |
| OGM-GE | — | — | ✓ |
| Audio loss balance | — | — | ✓ |
| Audio metrics | — | ✓ | ✓ |
| Audio supervision | — | ✓ | ✓ |

Some are mutually exclusive: `--hfato` is incompatible with `--ic_lora_strategy v2v` / `ref_latents`. Self-Flow's `dual_timestep` requires video or AV video-branch.

## Where the features wire into the training loop

- **`LTX2NetworkTrainer.__init__`** holds per-feature state (e.g., `self._crepa`, `self._self_flow_active`, `self._preservation_helper`), all `None`/`False` by default.
- **`_setup_*` methods** parse the CLI flags and lazily import the module if its flag is set. Run once before training starts.
- **Main training step** calls `compute_self_flow_addition`, `preservation_backward`, CREPA hooks, TARP/DCR masking, etc., each guarded by its `_active` flag.
- **Logging** — each feature logs its own metrics (e.g., `self_flow/cosine`, `self_flow/tau_mean`, `crepa/alignment`, `preservation/blank_loss`, `audio_metrics/mcd`) to the accelerator's tracker.
