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
      />
      <NumberField
        name="training.save_every_n_epochs"
        label="Save every N epochs"
        nullable
        integer
        min={1}
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
      />
    </Section>
  );
}
