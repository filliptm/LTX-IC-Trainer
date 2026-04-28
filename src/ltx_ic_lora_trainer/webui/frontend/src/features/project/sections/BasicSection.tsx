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
        tooltip={
          <>
            Path to the LTX-2 base DiT weights (<em>.safetensors</em>). This
            is the model your LoRA adapts. The Gemma text encoder and VAE are
            loaded separately.
            <br /><br />
            The trainer auto-detects 2.0 vs 2.3 from the file's header — set
            <em> LTX version</em> only if you want to force a specific one.
          </>
        }
      />
      <TextField
        name="training.gemma_root"
        label="Gemma root"
        placeholder="/path/to/gemma"
        hint="Gemma-2 text encoder weights directory. Required unless using --gemma_safetensors."
        badge="essential"
        tooltip={
          <>
            Directory holding the Gemma-2 text encoder in standard
            HuggingFace layout (<em>config.json</em> +{" "}
            <em>model.safetensors</em> shards).
            <br /><br />
            Required unless you point at a single-file Gemma checkpoint via
            <em> Gemma safetensors</em> (the alternative used for
            ComfyUI-style fp8 variants).
          </>
        }
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
        tooltip={
          <>
            Which of LTX-2's three branches you're training:
            <br /><br />
            <strong>video</strong> · text → video. The default.
            <br />
            <strong>audio</strong> · text → audio only.
            <br />
            <strong>av</strong> · bimodal audio + video, trained jointly with
            cross-modal attention. Costs more VRAM and time but the only mode
            where the audio LoRA can actually condition on the video.
          </>
        }
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
