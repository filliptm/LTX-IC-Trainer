import { Section } from "../Section";
import { TextField, SelectField } from "../FormFields";

export function BasicSection() {
  return (
    <Section>
      <TextField
        name="training.ltx2_checkpoint"
        label="LTX-2 checkpoint"
        placeholder="/path/to/ltx2.safetensors"
        hint="Base DiT weights. Required."
        badge="essential"
      />
      <TextField
        name="training.gemma_root"
        label="Gemma root"
        placeholder="/path/to/gemma"
        hint="Gemma-2 text encoder weights directory. Required unless using --gemma_safetensors."
        badge="essential"
      />
      <TextField
        name="training.gemma_safetensors"
        label="Gemma safetensors"
        placeholder="(optional) single-file Gemma checkpoint"
        hint="Alternative to --gemma_root for consolidated Gemma files (e.g. fp8 variants from ComfyUI)."
        badge="advanced"
      />
      <SelectField
        name="training.ltx2_mode"
        label="Mode"
        options={["video", "audio", "av"]}
        hint="video: text→video · audio: text→audio · av: bimodal audio+video with cross-modal attention"
        badge="essential"
      />
      <SelectField
        name="training.ltx_version"
        label="LTX version"
        options={["2.0", "2.3"]}
        hint="Target LTX-2 generation. Affects default hyperparameters and some internal behaviour."
        badge="advanced"
      />
      <SelectField
        name="training.ltx_version_check_mode"
        label="Version check mode"
        options={["off", "warn", "error"]}
        hint="What to do when the loaded checkpoint's detected version mismatches --ltx_version."
        badge="advanced"
      />
      <TextField
        name="training.output_dir"
        label="Output directory"
        placeholder="/path/to/output"
        hint="Where checkpoints, state, logs, and samples are written."
        badge="essential"
      />
      <TextField
        name="training.output_name"
        label="Output name"
        hint="Prefix for saved LoRA files. e.g. 'my_lora' → my_lora.safetensors"
      />
      <SelectField
        name="training.mixed_precision"
        label="Mixed precision"
        options={["no", "fp16", "bf16"]}
        badge="advanced"
      />
    </Section>
  );
}
