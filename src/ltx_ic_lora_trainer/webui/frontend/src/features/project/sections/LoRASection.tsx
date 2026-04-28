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
      />
      <NumberField
        name="training.network_dim"
        label="Network dim (rank)"
        integer
        min={1}
        badge="essential"
        hint="8 (tiny) · 16 (default) · 32 (medium) · 64 (large) · 128+ (major changes)"
      />
      <NumberField
        name="training.network_alpha"
        label="Network alpha"
        integer
        min={1}
        badge="essential"
        hint="Usually equals network_dim. Controls scaling of the LoRA delta weights."
      />
      <SelectField
        name="training.lora_target_preset"
        label="LoRA target preset"
        options={LORA_PRESETS}
        hint="Which attention/FFN modules get LoRA adapters. t2v = default text-to-video. See docs/training.md."
        badge="essential"
      />
      <SelectField
        name="training.ic_lora_strategy"
        label="IC-LoRA strategy"
        options={IC_LORA_STRATEGIES}
        hint="auto: inferred from preset · v2v: video-to-video reference conditioning · audio_ref_only_ic: ID-LoRA-style audio reference · none: standard text-to-X"
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
