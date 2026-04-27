import { Section } from "../Section";
import { NumberField, SwitchField, SelectField, TextField } from "../FormFields";

/**
 * Memory & performance section — split into 5 standalone sub-section
 * components so the tab navigator can render each one in isolation.
 */

export function MemoryVramSection() {
  return (
    <Section>
      <SwitchField
        name="training.gradient_checkpointing"
        label="Gradient checkpointing"
        hint="Trade speed for VRAM by recomputing activations on the backward pass. Recommended on for most users."
      />
      <SwitchField
        name="training.gradient_checkpointing_cpu_offload"
        label="Gradient ckpt CPU offload"
      />
      <NumberField
        name="training.blocks_to_swap"
        label="Blocks to swap (CPU)"
        nullable
        integer
        min={0}
        hint="Offload N transformer blocks to CPU between forward/backward. Saves VRAM at the cost of speed."
      />
      <SwitchField
        name="training.use_pinned_memory_for_block_swap"
        label="Pinned memory for block swap"
      />
      <SwitchField
        name="training.img_in_txt_in_offloading"
        label="Offload img_in / txt_in"
      />
    </Section>
  );
}

export function MemoryQuantSection() {
  return (
    <Section>
      <SwitchField name="training.fp8_base" label="FP8 base" />
      <SwitchField name="training.fp8_scaled" label="FP8 scaled" />
      <SwitchField name="training.fp8_w8a8" label="FP8 W8A8" />
      <SelectField
        name="training.w8a8_mode"
        label="W8A8 mode"
        options={[
          { value: "int8", label: "int8" },
          { value: "fp8", label: "fp8" },
        ]}
      />
      <SwitchField name="training.nf4_base" label="NF4 base" />
      <NumberField name="training.nf4_block_size" label="NF4 block size" integer min={1} />
      <SwitchField name="training.loftq_init" label="LoftQ init" />
      <NumberField name="training.loftq_iters" label="LoftQ iters" integer min={1} />
      <SwitchField name="training.awq_calibration" label="AWQ calibration" />
      <NumberField name="training.awq_alpha" label="AWQ alpha" step="0.01" min={0} max={1} />
      <NumberField name="training.awq_num_batches" label="AWQ num batches" integer min={1} />
      <SelectField
        name="training.quantize_device"
        label="Quantize device"
        options={[
          { value: "", label: "(auto)" },
          { value: "cpu", label: "cpu" },
          { value: "cuda", label: "cuda" },
        ]}
        hint="Where to run quantization prep. cpu saves VRAM but is slower."
      />
    </Section>
  );
}

export function MemoryAttnSection() {
  return (
    <Section>
      <SwitchField name="training.flash_attn" label="FlashAttention" />
      <SwitchField name="training.sdpa" label="SDPA (torch native)" />
      <SwitchField name="training.sage_attn" label="SageAttention" />
      <SwitchField name="training.xformers" label="xFormers" />
      <TextField
        name="training.split_attn_target"
        label="Split attn target"
        placeholder="(optional) layer pattern"
        hint="Pattern-based target for split attention. Leave empty unless you know the layer names."
      />
      <TextField name="training.split_attn_mode" label="Split attn mode" />
      <NumberField
        name="training.split_attn_chunk_size"
        label="Split attn chunk size"
        nullable
        integer
        min={1}
      />
      <TextField name="training.ffn_chunk_target" label="FFN chunk target" />
      <NumberField
        name="training.ffn_chunk_size"
        label="FFN chunk size"
        integer
        min={0}
      />
    </Section>
  );
}

export function MemoryCompileSection() {
  return (
    <Section>
      <SwitchField name="training.compile" label="Enable compile" />
      <SelectField
        name="training.compile_backend"
        label="Backend"
        options={[
          { value: "inductor", label: "inductor · default" },
          { value: "aot_eager", label: "aot_eager" },
          { value: "cudagraphs", label: "cudagraphs" },
        ]}
      />
      <SelectField
        name="training.compile_mode"
        label="Mode"
        options={[
          { value: "", label: "(default)" },
          { value: "default", label: "default" },
          { value: "reduce-overhead", label: "reduce-overhead" },
          { value: "max-autotune", label: "max-autotune" },
          { value: "max-autotune-no-cudagraphs", label: "max-autotune-no-cudagraphs" },
        ]}
      />
      <SwitchField name="training.compile_dynamic" label="Dynamic shapes" />
      <SwitchField name="training.compile_fullgraph" label="Full graph" />
      <NumberField
        name="training.compile_cache_size_limit"
        label="Cache size limit"
        nullable
        integer
        min={1}
      />
    </Section>
  );
}

export function MemoryGemmaSection() {
  return (
    <Section>
      <SwitchField name="training.gemma_load_in_8bit" label="Gemma 8-bit" />
      <SwitchField name="training.gemma_load_in_4bit" label="Gemma 4-bit" />
      <SwitchField
        name="training.gemma_bnb_4bit_disable_double_quant"
        label="Disable double quant"
      />
    </Section>
  );
}
