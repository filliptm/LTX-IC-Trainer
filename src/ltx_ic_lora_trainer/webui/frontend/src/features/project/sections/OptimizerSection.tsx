import { Section } from "../Section";
import { NumberField, TextAreaField, SelectOrCustomField } from "../FormFields";

const OPTIMIZER_OPTIONS = [
  { value: "adamw8bit", label: "adamw8bit · 8-bit Adam (recommended)" },
  { value: "adamw", label: "adamw" },
  { value: "pagedadamw8bit", label: "pagedadamw8bit · paged variant" },
  { value: "adafactor", label: "adafactor · memory-efficient" },
  { value: "lion", label: "lion" },
  { value: "lion8bit", label: "lion8bit" },
  { value: "prodigy", label: "prodigy · auto learning rate" },
  { value: "dadaptation", label: "dadaptation" },
  { value: "automagic", label: "automagic" },
] as const;

const LR_SCHEDULER_OPTIONS = [
  { value: "constant_with_warmup", label: "constant_with_warmup · default" },
  { value: "constant", label: "constant" },
  { value: "linear", label: "linear" },
  { value: "cosine", label: "cosine" },
  { value: "cosine_with_restarts", label: "cosine_with_restarts" },
  { value: "cosine_with_min_lr", label: "cosine_with_min_lr" },
  { value: "polynomial", label: "polynomial" },
  { value: "warmup_stable_decay", label: "warmup_stable_decay" },
  { value: "inverse_sqrt", label: "inverse_sqrt" },
  { value: "rex", label: "rex" },
  { value: "adafactor", label: "adafactor (only with adafactor optimizer)" },
] as const;

export function OptimizerSection() {
  return (
    <Section>
      <SelectOrCustomField
        name="training.optimizer_type"
        label="Optimizer"
        placeholder="module.path.to.Optimizer"
        options={OPTIMIZER_OPTIONS}
        hint="Pick a preset, or choose Custom… to supply a fully-qualified class path."
      />
      <NumberField
        name="training.learning_rate"
        label="Learning rate"
        step="0.00001"
        badge="essential"
        hint="1e-4 default · 1e-5 conservative · 1e-3 aggressive (risk of instability)"
      />
      <NumberField
        name="training.audio_lr"
        label="Audio LR (av mode)"
        step="0.00001"
        nullable
        hint="Override learning rate for audio-branch parameters. Leave empty to use the global LR."
        badge="advanced"
      />
      <TextAreaField
        name="training.optimizer_args"
        label="Optimizer args"
        placeholder='e.g. weight_decay=0.01 betas=(0.9,0.99)'
        hint="Extra kwargs passed to the optimiser constructor."
        badge="advanced"
      />
      <SelectOrCustomField
        name="training.lr_scheduler"
        label="LR scheduler"
        placeholder="module.path.to.Scheduler"
        options={LR_SCHEDULER_OPTIONS}
        hint="constant_with_warmup is safe default. Pick cosine for smoother decay over long runs."
      />
      <NumberField
        name="training.lr_warmup_steps"
        label="LR warmup steps"
        integer
        min={0}
      />
      <NumberField
        name="training.lr_decay_steps"
        label="LR decay steps"
        nullable
        integer
        min={0}
        badge="advanced"
      />
      <NumberField
        name="training.gradient_accumulation_steps"
        label="Gradient accumulation"
        integer
        min={1}
        badge="essential"
      />
      <NumberField
        name="training.max_grad_norm"
        label="Max grad norm"
        step="0.1"
        min={0}
        hint="Gradient clipping. 0 = disabled."
      />
    </Section>
  );
}
