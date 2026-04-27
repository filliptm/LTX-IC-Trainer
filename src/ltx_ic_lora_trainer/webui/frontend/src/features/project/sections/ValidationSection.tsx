import { Section } from "../Section";
import { NumberField } from "../FormFields";

export function ValidationSection() {
  return (
    <Section>
      <div className="text-sm text-muted-foreground">
        Validation computes a held-out loss on every step/epoch trigger, using
        the <span className="font-mono">validation_datasets</span> you
        configured on the <span className="font-medium">Dataset</span> tab.
        No image generation — see the <span className="font-medium">Sampling</span> section
        above for that.
      </div>
      <NumberField
        name="training.validate_every_n_steps"
        label="Validate every N steps"
        nullable
        integer
        min={1}
      />
      <NumberField
        name="training.validate_every_n_epochs"
        label="Validate every N epochs"
        nullable
        integer
        min={1}
      />
    </Section>
  );
}
