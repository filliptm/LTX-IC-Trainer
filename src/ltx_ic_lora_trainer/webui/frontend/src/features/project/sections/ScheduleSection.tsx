import { Section } from "../Section";
import { NumberField, SelectField } from "../FormFields";

const TIMESTEP_SAMPLING_OPTIONS = [
  { value: "shifted_logit_normal", label: "shifted_logit_normal · LTX-2 default" },
  { value: "uniform", label: "uniform" },
  { value: "sigmoid", label: "sigmoid" },
  { value: "shift", label: "shift" },
  { value: "flux_shift", label: "flux_shift" },
  { value: "flux2_shift", label: "flux2_shift" },
  { value: "qwen_shift", label: "qwen_shift" },
  { value: "logsnr", label: "logsnr" },
  { value: "qinglong_flux", label: "qinglong_flux" },
  { value: "qinglong_qwen", label: "qinglong_qwen" },
] as const;

const WEIGHTING_SCHEME_OPTIONS = [
  { value: "none", label: "none · no weighting" },
  { value: "sigma_sqrt", label: "sigma_sqrt" },
  { value: "logit_normal", label: "logit_normal" },
  { value: "mode", label: "mode" },
  { value: "cosmap", label: "cosmap" },
] as const;

const LOSS_TYPE_OPTIONS = [
  { value: "mse", label: "mse · mean squared error (default)" },
  { value: "mae", label: "mae · mean absolute error" },
  { value: "l1", label: "l1" },
  { value: "huber", label: "huber" },
  { value: "smooth_l1", label: "smooth_l1" },
] as const;

export function ScheduleSection() {
  return (
    <Section>
      <NumberField
        name="training.max_train_steps"
        label="Max train steps"
        integer
        min={1}
        badge="essential"
        hint="A few hundred to a few thousand. More steps = more training time."
        tooltip={
          <>
            Total optimiser steps before training stops. One "step" =
            one update to the LoRA weights (after gradient accumulation, if
            any).
            <br /><br />
            Rough scale: <strong>200–500</strong> for a quick experiment,{" "}
            <strong>1k–6k</strong> for most LoRAs, <strong>10k+</strong>{" "}
            when you're trying to drive deep behaviour change in the base
            model. Save checkpoints often so you can pick the best one
            after the fact.
          </>
        }
      />
      <NumberField
        name="training.max_train_epochs"
        label="Max train epochs"
        nullable
        integer
        min={1}
        hint="Takes precedence over max_train_steps when set."
        badge="advanced"
      />
      <NumberField
        name="training.save_every_n_steps"
        label="Save every N steps"
        nullable
        integer
        min={1}
        tooltip={
          <>
            Checkpoint cadence in optimiser steps. Each save writes a full
            LoRA <em>.safetensors</em> plus a <em>.comfy.safetensors</em>{" "}
            companion. State directories (resumable) are also written so you
            can pause/resume.
            <br /><br />
            Common picks: <strong>250–500</strong>. Leave empty to only save
            on training end / pause.
          </>
        }
      />
      <NumberField
        name="training.save_every_n_epochs"
        label="Save every N epochs"
        nullable
        integer
        min={1}
        tooltip={
          <>
            Same as <em>Save every N steps</em>, but on epoch boundaries
            (full passes through the dataset). Use this <em>or</em> the
            steps version. Setting both is fine — whichever fires first
            wins.
          </>
        }
      />
      <SelectField
        name="training.timestep_sampling"
        label="Timestep sampling"
        options={TIMESTEP_SAMPLING_OPTIONS}
        badge="advanced"
      />
      <NumberField
        name="training.discrete_flow_shift"
        label="Discrete flow shift"
        step="0.1"
        badge="advanced"
      />
      <SelectField
        name="training.weighting_scheme"
        label="Weighting scheme"
        options={WEIGHTING_SCHEME_OPTIONS}
        badge="advanced"
      />
      <SelectField
        name="training.loss_type"
        label="Loss type"
        options={LOSS_TYPE_OPTIONS}
        badge="advanced"
      />
      <NumberField
        name="training.seed"
        label="Seed"
        nullable
        integer
        min={0}
        hint="Leave empty for random. Set a fixed value for reproducibility."
        tooltip={
          <>
            Random seed for timestep sampling, dropout, and dataloader
            shuffling. Setting a fixed seed makes two runs with identical
            configs produce identical training (modulo CUDA non-determinism
            in some kernels).
            <br /><br />
            Leave empty for a fresh random seed per run — usually what you
            want unless you're chasing a specific result.
          </>
        }
      />
    </Section>
  );
}
