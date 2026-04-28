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
        tooltip={
          <>
            Which optimiser drives the parameter updates:
            <br /><br />
            <strong>adamw8bit</strong> · bitsandbytes 8-bit AdamW. Default —
            half the VRAM of plain AdamW with no quality loss in practice.
            <br />
            <strong>adafactor</strong> · even more memory-efficient
            (no per-parameter momentum). LR-sensitive; pair with a higher LR.
            <br />
            <strong>prodigy / dadaptation</strong> · auto-tune the learning
            rate. Useful when you don't know what LR to pick.
            <br />
            <strong>lion / lion8bit</strong> · sign-based updates, sometimes
            faster convergence on large LoRAs.
          </>
        }
      />
      <NumberField
        name="training.learning_rate"
        label="Learning rate"
        step="0.00001"
        badge="essential"
        hint="1e-4 default · 1e-5 conservative · 1e-3 aggressive (risk of instability)"
        tooltip={
          <>
            How aggressively each step moves the LoRA weights. <strong>1e-4</strong>{" "}
            is the safe default for LTX-2 LoRA training.
            <br /><br />
            If loss spikes, NaNs, or you see early instability — halve it.
            If training is glacially slow and loss barely moves — try 2× or
            5×, but watch for divergence.
            <br /><br />
            Ignored when using <em>prodigy</em>/<em>dadaptation</em> (those
            pick their own LR).
          </>
        }
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
        tooltip={
          <>
            How the learning rate changes over the run:
            <br /><br />
            <strong>constant_with_warmup</strong> · ramps from 0 to the
            target LR over <em>warmup steps</em>, then stays flat. Default —
            predictable and well-behaved.
            <br />
            <strong>cosine</strong> · smooth half-cosine decay toward zero.
            Good for longer runs where you want fine-tuning at the end.
            <br />
            <strong>linear</strong> · linear decay from target LR → 0.
            <br />
            <strong>rex</strong> · reverse-exp; slower decay early, faster
            late.
          </>
        }
      />
      <NumberField
        name="training.lr_warmup_steps"
        label="LR warmup steps"
        integer
        min={0}
        tooltip={
          <>
            Steps at the start of training where the LR ramps from 0 up to
            the target. Prevents instability before the optimiser's moment
            estimates have settled.
            <br /><br />
            <strong>100</strong> is fine for most runs. Larger LoRAs (rank
            64+) often benefit from <strong>200–500</strong>. Set to 0 to
            disable.
          </>
        }
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
        tooltip={
          <>
            Run N forward/backward passes before stepping the optimiser.
            Simulates a larger batch size on limited VRAM:
            <br /><br />
            <em>effective batch = batch_size × gradient_accumulation_steps</em>
            <br /><br />
            Costs N× wall-clock per optimiser step but doesn't increase
            VRAM. Set to 1 to disable. Useful when your dataset's batch
            size is forced low by VRAM but you want a smoother gradient.
          </>
        }
      />
      <NumberField
        name="training.max_grad_norm"
        label="Max grad norm"
        step="0.1"
        min={0}
        hint="Gradient clipping. 0 = disabled."
        tooltip={
          <>
            Clips the L2 norm of all gradients to at most this value before
            each optimiser step. Prevents loss explosions when a bad batch
            produces huge gradients.
            <br /><br />
            <strong>1.0</strong> is the standard choice and what almost
            every LTX-2 training run uses. <strong>0</strong> disables
            clipping entirely.
          </>
        }
      />
    </Section>
  );
}
