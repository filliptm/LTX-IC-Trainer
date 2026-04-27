import { Section } from "../Section";
import { NumberField, SwitchField, SelectField } from "../FormFields";

/**
 * Research features — each opt-in feature is its own standalone component
 * so the tab navigator can render each one in isolation. The drill-down
 * design means users focus on one feature at a time.
 *
 * Rarely-edited knobs (e.g. CREPA block indices) are intentionally NOT
 * exposed here — they can still be edited by hand in project.json.
 */

export function ResearchCrepaSection() {
  return (
    <Section>
      <SwitchField name="training.crepa" label="Enable CREPA" />
      <SelectField
        name="training.crepa_mode"
        label="Mode"
        options={[
          { value: "backbone", label: "backbone · in-model teacher" },
          { value: "dino", label: "dino · pre-cached DINOv2 features" },
        ]}
        hint="backbone: uses a deeper transformer block as teacher · dino: zero extra VRAM using pre-cached features"
      />
      <SelectField
        name="training.crepa_dino_model"
        label="DINO model"
        options={[
          { value: "dinov2_vits14", label: "dinov2_vits14 · small" },
          { value: "dinov2_vitb14", label: "dinov2_vitb14 · base (default)" },
          { value: "dinov2_vitl14", label: "dinov2_vitl14 · large" },
          { value: "dinov2_vitg14", label: "dinov2_vitg14 · giant" },
        ]}
      />
      <NumberField name="training.crepa_lambda" label="Lambda" step="0.01" min={0} />
      <NumberField name="training.crepa_tau" label="Tau" step="0.01" min={0} />
      <SelectField
        name="training.crepa_schedule"
        label="Schedule"
        options={[
          { value: "constant", label: "constant" },
          { value: "linear", label: "linear" },
          { value: "cosine", label: "cosine" },
        ]}
      />
    </Section>
  );
}

export function ResearchSelfFlowSection() {
  return (
    <Section>
      <SwitchField name="training.self_flow" label="Enable Self-Flow" />
      <SelectField
        name="training.self_flow_teacher_mode"
        label="Teacher mode"
        options={[
          { value: "base", label: "base · frozen" },
          { value: "ema", label: "ema · exponential moving average" },
          { value: "partial_ema", label: "partial_ema" },
        ]}
      />
      <NumberField name="training.self_flow_lambda" label="Lambda" step="0.01" min={0} />
      <SwitchField name="training.self_flow_dual_timestep" label="Dual timestep" />
      <SelectField
        name="training.self_flow_temporal_mode"
        label="Temporal mode"
        options={[
          { value: "off", label: "off" },
          { value: "frame", label: "frame" },
          { value: "delta", label: "delta" },
          { value: "hybrid", label: "hybrid" },
        ]}
      />
      <SelectField
        name="training.self_flow_temporal_schedule"
        label="Temporal schedule"
        options={[
          { value: "constant", label: "constant" },
          { value: "linear", label: "linear" },
          { value: "cosine", label: "cosine" },
        ]}
      />
      <SelectField
        name="training.self_flow_temporal_granularity"
        label="Temporal granularity"
        options={[
          { value: "frame", label: "frame" },
          { value: "patch", label: "patch · finer-grained" },
        ]}
      />
      <SelectField
        name="training.self_flow_patch_match_mode"
        label="Patch match mode"
        options={[
          { value: "hard", label: "hard" },
          { value: "soft", label: "soft" },
        ]}
      />
      <SelectField
        name="training.self_flow_motion_weighting"
        label="Motion weighting"
        options={[
          { value: "none", label: "none" },
          { value: "teacher_delta", label: "teacher_delta" },
        ]}
      />
      <SelectField
        name="training.self_flow_projector_activation"
        label="Projector activation"
        options={[
          { value: "silu", label: "silu" },
          { value: "gelu", label: "gelu" },
        ]}
      />
    </Section>
  );
}

export function ResearchHfatoSection() {
  return (
    <Section>
      <SwitchField name="training.hfato" label="Enable HFATO" />
      <NumberField name="training.hfato_scale_factor" label="Scale factor" step="0.05" min={0} max={1} />
      <SelectField
        name="training.hfato_interpolation"
        label="Interpolation"
        options={[
          { value: "bilinear", label: "bilinear (default)" },
          { value: "nearest", label: "nearest" },
          { value: "bicubic", label: "bicubic" },
        ]}
      />
      <NumberField name="training.hfato_probability" label="Probability" step="0.01" min={0} max={1} />
    </Section>
  );
}

export function ResearchPreservationSection() {
  return (
    <Section>
      <SwitchField name="training.blank_preservation" label="Blank preservation" />
      <NumberField
        name="training.blank_preservation_multiplier"
        label="Blank lambda"
        step="0.01"
        min={0}
      />
      <SwitchField name="training.dop" label="DOP (class preservation)" />
      <NumberField name="training.dop_multiplier" label="DOP lambda" step="0.01" min={0} />
      <SwitchField name="training.prior_divergence" label="Prior divergence" />
      <NumberField
        name="training.prior_divergence_multiplier"
        label="Prior lambda"
        step="0.01"
        min={0}
      />
      <SwitchField
        name="training.use_precached_preservation"
        label="Use precached preservation prompts"
      />
    </Section>
  );
}

export function ResearchTarpSection() {
  return (
    <Section>
      <SwitchField name="training.tarp" label="Enable TARP" />
      <NumberField name="training.tarp_window_multiplier" label="Window multiplier" integer min={1} />
      <SwitchField name="training.dcr" label="Enable DCR" />
      <SwitchField name="training.dcr_reference_detach" label="Reference detach" />
    </Section>
  );
}

export function ResearchAudioLossSection() {
  return (
    <Section>
      <SelectField
        name="training.audio_loss_balance_mode"
        label="Mode"
        options={[
          { value: "none", label: "none · static weighting" },
          { value: "inv_freq", label: "inv_freq · inverse frequency" },
          { value: "ema_mag", label: "ema_mag · EMA magnitude ratio" },
          { value: "uncertainty", label: "uncertainty · learnable log-variance" },
        ]}
      />
      <NumberField name="training.video_loss_weight" label="Video loss weight" step="0.1" min={0} />
      <NumberField name="training.audio_loss_weight" label="Audio loss weight" step="0.1" min={0} />
      <SwitchField name="training.independent_audio_timestep" label="Independent audio timestep" />
      <SwitchField name="training.audio_silence_regularizer" label="Audio silence regularizer" />
    </Section>
  );
}

export function ResearchAudioMetricsSection() {
  return (
    <Section>
      <SwitchField name="training.audio_metrics" label="Enable audio metrics" />
      <SwitchField name="training.audio_metrics_mel_metrics" label="Mel-space metrics" />
      <NumberField
        name="training.audio_metrics_mel_compute_every"
        label="Compute every N steps"
        integer
        min={1}
      />
      <SwitchField name="training.audio_metrics_clap_similarity" label="CLAP similarity" />
    </Section>
  );
}

export function ResearchModalitySection() {
  return (
    <Section>
      <NumberField
        name="training.modality_freeze_check_interval"
        label="Check interval"
        integer
        min={0}
        hint="0 disables."
      />
      <NumberField
        name="training.modality_freeze_ratio_threshold"
        label="Ratio threshold"
        step="0.01"
        min={0}
        max={1}
      />
      <NumberField
        name="training.modality_freeze_warmup_steps"
        label="Warmup steps"
        integer
        min={0}
      />
    </Section>
  );
}

export function ResearchCtsSection() {
  return (
    <Section>
      <NumberField
        name="training.cts_lambda_video_driven"
        label="Video-driven lambda"
        step="0.01"
        min={0}
      />
      <NumberField
        name="training.cts_lambda_audio_driven"
        label="Audio-driven lambda"
        step="0.01"
        min={0}
      />
    </Section>
  );
}

export function ResearchAudioSupSection() {
  return (
    <Section>
      <SelectField
        name="training.audio_supervision_mode"
        label="Mode"
        options={[
          { value: "off", label: "off · no check (default)" },
          { value: "warn", label: "warn · log warning" },
          { value: "error", label: "error · halt training" },
        ]}
      />
      <NumberField
        name="training.audio_supervision_warmup_steps"
        label="Warmup steps"
        integer
        min={0}
      />
      <NumberField
        name="training.audio_supervision_min_ratio"
        label="Min ratio"
        step="0.01"
        min={0}
        max={1}
      />
    </Section>
  );
}
