import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export type Option = { value: string; label: string };

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Shared = { name: string; label: string; hint?: string };

export function TextField({
  name,
  label,
  hint,
  ...props
}: Shared & Omit<ComponentProps<"input">, "name" | "id">) {
  return (
    <Field id={name} label={label} hint={hint}>
      <Input id={name} name={name} {...props} />
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  ...props
}: Shared & Omit<ComponentProps<"textarea">, "name" | "id">) {
  return (
    <Field id={name} label={label} hint={hint}>
      <Textarea id={name} name={name} {...props} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  options,
  blank,
  ...props
}: Shared & {
  options: readonly Option[];
  blank?: string;
} & Omit<ComponentProps<"select">, "name" | "id" | "size">) {
  return (
    <Field id={name} label={label} hint={hint}>
      <NativeSelect id={name} name={name} className="w-full" {...props}>
        {blank !== undefined && (
          <NativeSelectOption value="">{blank}</NativeSelectOption>
        )}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
