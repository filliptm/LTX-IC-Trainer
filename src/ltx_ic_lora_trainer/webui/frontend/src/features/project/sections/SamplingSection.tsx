import { Section, SubGroup } from "../Section";
import { NumberField, TextField, SwitchField } from "../FormFields";

export function SamplingSection() {
  return (
    <Section>
      <NumberField
        name="training.sample_every_n_steps"
        label="Sample every N steps"
        nullable
        integer
        min={1}
        hint="Run inference and write preview videos/images this often during training."
      />
      <NumberField
        name="training.sample_every_n_epochs"
        label="Sample every N epochs"
        nullable
        integer
        min={1}
      />
      <SwitchField
        name="training.sample_at_first"
        label="Sample at step 0"
        hint="Generate a sample before training starts (baseline reference)."
      />
      <TextField
        name="training.sample_prompts"
        label="Sample prompts file"
        placeholder="/path/to/sample_prompts.txt"
        hint="Plain text or TOML file, one prompt per line, optionally with --w/--h/--f overrides."
      />
      <SwitchField
        name="training.use_precached_sample_prompts"
        label="Use precached sample prompts"
        hint="Skip Gemma text-encoding during sampling by loading cached embeddings."
      />
      <TextField
        name="training.sample_prompts_cache"
        label="Sample prompts cache"
        placeholder="(auto) <dataset_cache>/ltx2_sample_prompts_cache.pt"
      />
      <SwitchField
        name="training.use_precached_sample_latents"
        label="Use precached sample latents"
      />
      <TextField
        name="training.sample_latents_cache"
        label="Sample latents cache"
      />

      <SubGroup title="Preview size">
        <NumberField name="training.height" label="Height" integer min={1} />
        <NumberField name="training.width" label="Width" integer min={1} />
        <NumberField
          name="training.sample_num_frames"
          label="Num frames"
          integer
          min={1}
        />
      </SubGroup>

      <SubGroup title="Memory & misc">
        <SwitchField
          name="training.sample_with_offloading"
          label="Offload DiT between prompts"
          hint="Move the transformer to CPU between sample prompts to free VRAM."
        />
        <SwitchField
          name="training.sample_tiled_vae"
          label="Tiled VAE decode"
        />
        <NumberField
          name="training.sample_vae_tile_size"
          label="VAE tile size"
          nullable
          integer
          min={1}
        />
        <NumberField
          name="training.sample_vae_tile_overlap"
          label="VAE tile overlap"
          nullable
          integer
          min={0}
        />
        <NumberField
          name="training.sample_vae_temporal_tile_size"
          label="VAE temporal tile size"
          nullable
          integer
          min={1}
        />
        <NumberField
          name="training.sample_vae_temporal_tile_overlap"
          label="VAE temporal tile overlap"
          nullable
          integer
          min={0}
        />
        <SwitchField name="training.sample_disable_flash_attn" label="Disable flash attention" />
        <SwitchField name="training.sample_i2v_token_timestep_mask" label="I2V token timestep mask" />
      </SubGroup>

      <SubGroup title="Two-stage upsampling">
        <SwitchField name="training.sample_two_stage" label="Enable two-stage" />
        <TextField
          name="training.spatial_upsampler_path"
          label="Spatial upsampler path"
          placeholder="/path/to/upsampler.safetensors"
        />
        <TextField
          name="training.distilled_lora_path"
          label="Distilled LoRA path"
        />
        <NumberField
          name="training.sample_stage2_steps"
          label="Stage 2 steps"
          integer
          min={1}
        />
      </SubGroup>

      <SubGroup title="Audio (av mode)">
        <SwitchField name="training.sample_merge_audio" label="Mux audio into sample videos" />
        <SwitchField name="training.sample_disable_audio" label="Skip audio generation" />
        <SwitchField name="training.sample_audio_only" label="Audio only (skip video)" />
        <SwitchField
          name="training.sample_audio_subprocess"
          label="Decode audio in subprocess"
        />
      </SubGroup>

      <SubGroup title="V2V reference">
        <SwitchField name="training.sample_include_reference" label="Show reference side-by-side" />
        <NumberField name="training.reference_downscale" label="Reference downscale" integer min={1} />
        <NumberField name="training.reference_frames" label="Reference frames" integer min={1} />
      </SubGroup>
    </Section>
  );
}
