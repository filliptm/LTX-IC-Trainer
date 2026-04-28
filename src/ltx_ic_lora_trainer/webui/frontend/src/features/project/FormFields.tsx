import { type ReactNode } from "react";
import { useFormContext, Controller, type FieldValues, type FieldPath } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

/**
 * Small, unstyled form-field helpers used across every Project accordion
 * section. All fields connect to the ambient React Hook Form instance via
 * useFormContext, so sections don't need to thread `control` manually.
 *
 * Label column is 200px; inputs fill the rest of the row. A hint row sits
 * under the input for secondary context.
 */

type FieldBadge = "essential" | "advanced" | "research";

interface BaseFieldProps<T extends FieldValues = FieldValues> {
  name: FieldPath<T>;
  label: string;
  hint?: string;
  placeholder?: string;
  className?: string;
  badge?: FieldBadge;
}

interface RowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  badge?: FieldBadge;
  /** DOM data-attribute used by sidebar search to scroll into view. */
  fieldId?: string;
}

const BADGE_CLASS: Record<FieldBadge, string> = {
  essential: "bg-[hsl(var(--status-success))]/15 text-[hsl(var(--status-success))]",
  advanced: "bg-[hsl(var(--status-warning))]/15 text-[hsl(var(--status-warning))]",
  research: "bg-muted text-muted-foreground",
};

function Row({ label, hint, children, className, badge, fieldId }: RowProps) {
  const showAdvanced = useUIStore((s) => s.showAdvancedTraining);

  // Hide advanced/research-tagged fields entirely when the user is in
  // "essentials only" mode. This keeps Essentials sections lean by default
  // while preserving the field in the form state — flipping the toggle
  // brings it back without the user losing any saved value.
  if (!showAdvanced && (badge === "advanced" || badge === "research")) {
    return null;
  }

  return (
    <div
      className={cn("grid grid-cols-[200px_1fr] items-start gap-3 transition-shadow", className)}
      data-field-id={fieldId}
    >
      <div className="mt-2 flex items-center gap-1.5">
        <Label className="text-muted-foreground">{label}</Label>
        {badge && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
              BADGE_CLASS[badge],
            )}
          >
            {badge === "essential" ? "req" : badge === "advanced" ? "adv" : "res"}
          </span>
        )}
      </div>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function TextField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  placeholder,
  badge,
}: BaseFieldProps<T>) {
  const { register } = useFormContext<T>();
  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <Input {...register(name)} placeholder={placeholder} />
    </Row>
  );
}

export function TextAreaField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  placeholder,
  badge,
}: BaseFieldProps<T>) {
  const { register } = useFormContext<T>();
  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <Textarea {...register(name)} placeholder={placeholder} />
    </Row>
  );
}

/**
 * Numeric input. Handles both required (int / float with default) and
 * Optional[int] / Optional[float] fields — empty string is coerced to
 * null for the latter.
 */
interface NumberFieldProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T> {
  step?: number | string;
  min?: number;
  max?: number;
  /** If true, empty input is stored as null (maps to Pydantic Optional[int/float]). */
  nullable?: boolean;
  /** Parse to int vs float. Default float. */
  integer?: boolean;
}

export function NumberField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  placeholder,
  step,
  min,
  max,
  nullable = false,
  integer = false,
  badge,
}: NumberFieldProps<T>) {
  const { control } = useFormContext<T>();
  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            type="number"
            step={step ?? (integer ? 1 : "any")}
            min={min}
            max={max}
            placeholder={placeholder}
            value={field.value === null || field.value === undefined ? "" : String(field.value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                field.onChange(nullable ? null : 0);
                return;
              }
              const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
              field.onChange(Number.isNaN(parsed) ? (nullable ? null : 0) : parsed);
            }}
          />
        )}
      />
    </Row>
  );
}

interface SelectFieldProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T> {
  options: readonly string[] | readonly { value: string; label: string }[];
}

export function SelectField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  options,
  badge,
}: SelectFieldProps<T>) {
  const { register } = useFormContext<T>();
  const normalised = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <Select {...register(name)}>
        {normalised.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Row>
  );
}

export function SwitchField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  badge,
}: BaseFieldProps<T>) {
  const { control } = useFormContext<T>();
  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <div className="flex h-9 items-center">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>
    </Row>
  );
}

/**
 * Hybrid select + custom text field. Shows a <select> with preset options
 * plus a "Custom…" option. When the stored value matches a preset, the
 * select is active. When the value is a custom string (or the user picks
 * "Custom…"), a text input appears instead with a small "Use preset" button
 * to switch back.
 *
 * Use only for fields where the Python backend genuinely accepts arbitrary
 * values (e.g. optimizer_type supports user-supplied module paths via
 * importlib). For strict Literal enums, use SelectField instead.
 */
interface SelectOrCustomFieldProps<T extends FieldValues = FieldValues> extends BaseFieldProps<T> {
  options: readonly string[] | readonly { value: string; label: string }[];
}

const CUSTOM_SENTINEL = "__custom__";

export function SelectOrCustomField<T extends FieldValues = FieldValues>({
  name,
  label,
  hint,
  placeholder,
  options,
  badge,
}: SelectOrCustomFieldProps<T>) {
  const { control } = useFormContext<T>();
  const normalised = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const presetValues = new Set(normalised.map((o) => o.value));

  return (
    <Row label={label} hint={hint} badge={badge} fieldId={name as string}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const current = (field.value as string | undefined) ?? "";
          const isCustom = current !== "" && !presetValues.has(current);
          return isCustom ? (
            <div className="flex items-center gap-2">
              <Input
                value={current}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={placeholder}
              />
              <button
                type="button"
                onClick={() => field.onChange(normalised[0]?.value ?? "")}
                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                title="Reset to a preset option"
              >
                use preset
              </button>
            </div>
          ) : (
            <Select
              value={current}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM_SENTINEL) {
                  // Nudge the value to an empty string — triggers the custom-input branch
                  // Use a placeholder so the user sees a clear hint instead of a blank field.
                  field.onChange(" ");
                } else {
                  field.onChange(v);
                }
              }}
            >
              {normalised.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value={CUSTOM_SENTINEL}>Custom…</option>
            </Select>
          );
        }}
      />
    </Row>
  );
}
