import { Section } from "../Section";
import { TextField, NumberField, SelectField, SelectOrCustomField, SwitchField, TextAreaField } from "../FormFields";

const LORA_PRESETS = [
  { value: "t2v", label: "t2v · text → video (default)" },
  { value: "v2v", label: "v2v · video → video reference" },
  { value: "video_sa", label: "video_sa · video self-attention only" },
  { value: "video_sa_ff", label: "video_sa_ff · self-attn + FFN" },
  { value: "video_sa_ca_ff", label: "video_sa_ca_ff · self + cross + FFN" },
  { value: "audio", label: "audio · text → audio" },
  { value: "audio_ref_only_ic", label: "audio_ref_only_ic · audio identity" },
  { value: "full", label: "full · every trainable module" },
] as const;

const IC_LORA_STRATEGIES = [
  { value: "auto", label: "auto · inferred from preset" },
  { value: "none", label: "none · standard text-to-X" },
  { value: "v2v", label: "v2v · video reference conditioning" },
  { value: "audio_ref_only_ic", label: "audio_ref_only_ic · ID-LoRA audio" },
] as const;

const NETWORK_MODULE_OPTIONS = [
  { value: "networks.lora_ltx2", label: "networks.lora_ltx2 · standard LoRA (default)" },
  { value: "networks.loha", label: "networks.loha · Hadamard product" },
  { value: "networks.lokr", label: "networks.lokr · Kronecker product" },
] as const;

const VERSION_CHECK_MODES = [
  { value: "warn", label: "warn · log a warning (default)" },
  { value: "off", label: "off · no check" },
  { value: "error", label: "error · halt on mismatch" },
] as const;

export function LoRASection() {
  return (
    <Section>
      <SelectOrCustomField
        name="training.network_module"
        label="Network module"
        options={NETWORK_MODULE_OPTIONS}
        placeholder="e.g. lycoris.modules.loha"
        hint="Standard LoRA works for most cases. LoHa/LoKr are advanced LyCORIS variants."
        tooltip={
          <>
            Which adapter implementation to use:
            <br /><br />
            <strong>networks.lora_ltx2</strong> · standard low-rank
            adaptation. The default — what you almost certainly want.
            <br />
            <strong>networks.loha</strong> · Hadamard-product variant
            (LyCORIS). Same parameter count splits across two smaller
            matrices — slower, sometimes more expressive.
            <br />
            <strong>networks.lokr</strong> · Kronecker-product variant. Even
            more parameter-efficient at high ranks; rarely needed for video.
          </>
        }
      />
      <NumberField
        name="training.network_dim"
        label="Network dim (rank)"
        integer
        min={1}
        badge="essential"
        hint="8 (tiny) · 16 (default) · 32 (medium) · 64 (large) · 128+ (major changes)"
        tooltip={
          <>
            Capacity of the LoRA. Higher rank means more expressive, larger
            files, slower training, more VRAM.
            <br /><br />
            Rough rule of thumb: <strong>16</strong> for style-only,{" "}
            <strong>32–64</strong> for a subject + behaviour LoRA,{" "}
            <strong>128+</strong> when you're trying to drive major changes
            in the base model (effectively near-full-fine-tune).
          </>
        }
      />
      <NumberField
        name="training.network_alpha"
        label="Network alpha"
        integer
        min={1}
        badge="essential"
        hint="Usually equals network_dim. Controls scaling of the LoRA delta weights."
        tooltip={
          <>
            Effective scale at which LoRA deltas are applied to the base
            weights. The actual scale is <em>alpha / rank</em>.
            <br /><br />
            Setting <em>alpha = rank</em> gives a 1× scale (the typical
            choice). Lower alpha → gentler training and smaller updates;
            higher alpha → more aggressive, faster fitting (and faster
            overfitting).
          </>
        }
      />
      <SelectField
        name="training.lora_target_preset"
        label="LoRA target preset"
        options={LORA_PRESETS}
        hint="Which attention/FFN modules get LoRA adapters. t2v = default text-to-video. See docs/training.md."
        badge="essential"
        tooltip={
          <>
            Which transformer modules get LoRA adapters injected:
            <br /><br />
            <strong>t2v</strong> · all attention QKV+Out across video, audio,
            and cross-modal. Default for text-to-video.
            <br />
            <strong>v2v</strong> · attention + FFN. The IC-LoRA setup —
            higher capacity, needed for reference conditioning.
            <br />
            <strong>video_sa / _ff / _ca_ff</strong> · cheaper subsets if
            you want a smaller LoRA file.
            <br />
            <strong>full</strong> · everything trainable. Rarely worth it.
          </>
        }
      />
      <SelectField
        name="training.ic_lora_strategy"
        label="IC-LoRA strategy"
        options={IC_LORA_STRATEGIES}
        hint="auto: inferred from preset · v2v: video-to-video reference conditioning · audio_ref_only_ic: ID-LoRA-style audio reference · none: standard text-to-X"
        tooltip={
          <>
            How reference conditioning is wired through the LoRA:
            <br /><br />
            <strong>auto</strong> · picks based on the target preset (t2v →
            none, v2v → v2v, etc). Recommended.
            <br />
            <strong>v2v</strong> · enables video-to-video reference
            conditioning. Requires reference images/videos in the dataset's{" "}
            <em>reference_directory</em>.
            <br />
            <strong>audio_ref_only_ic</strong> · ID-LoRA-style audio
            reference (av/audio mode only).
            <br />
            <strong>none</strong> · plain text-to-X with no reference.
          </>
        }
      />
      <NumberField
        name="training.network_dropout"
        label="Network dropout"
        nullable
        step="0.01"
        min={0}
        max={1}
        badge="advanced"
      />
      <NumberField
        name="training.scale_weight_norms"
        label="Scale weight norms"
        nullable
        step="0.1"
        badge="advanced"
      />
      <TextAreaField
        name="training.network_args"
        label="Network args"
        placeholder='e.g. algo=lora preset=attn-mlp'
        hint="Additional network-module kwargs, space-separated key=value pairs."
        badge="advanced"
      />
      <TextField
        name="training.network_weights"
        label="Network weights (resume)"
        placeholder="/path/to/existing_lora.safetensors"
        hint="Continue training an existing LoRA instead of starting from scratch."
        badge="advanced"
      />
      <SwitchField
        name="training.train_connectors"
        label="Train text connectors"
        hint="Also train the Gemma → video/audio context connector modules (requires --cache_before_connector in Caching)."
        badge="research"
      />
      <SwitchField
        name="training.save_original_lora"
        label="Save original LoRA"
        hint="Keep the raw LoRA alongside the ComfyUI-converted copy when saving checkpoints."
        badge="advanced"
      />
      <TextField
        name="training.lycoris_config"
        label="LyCORIS config"
        placeholder="/path/to/lycoris.toml"
        hint="Path to a LyCORIS TOML. Only needed when using a LyCORIS network_module."
        badge="advanced"
      />
      <SelectField
        name="training.lycoris_quantized_base_check_mode"
        label="LyCORIS quant check"
        options={VERSION_CHECK_MODES}
        hint="How to handle LyCORIS quantized-base compatibility mismatches."
        badge="advanced"
      />
    </Section>
  );
}
