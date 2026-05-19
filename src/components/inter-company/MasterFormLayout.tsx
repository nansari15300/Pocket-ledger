"use client";

/**
 * Master forms — 2 fields per row; naam + A/c No ek row; shared Mobile No.
 */
import type { ReactNode } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { masterFormRowClassName } from "@/lib/masterFormPillChrome";
import { MasterFormInterCompanyAcNoSlot } from "@/components/inter-company/MasterFormInterCompanyAcNoSlot";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

/** Har master form — mobile+ par 2 column; `pl-master-form-row` = pill height + align (`globals.css`) */
export const masterFormTwoColClass =
  "pl-master-form-row grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-stretch";

/** Full-width row (address, photo, documents, …) — Pro theme row pill cycle */
export function MasterFormRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(masterFormRowClassName, className)}>{children}</div>;
}

export function MasterFormTwoColGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(masterFormTwoColClass, className)}>{children}</div>;
}

/** Account / party naam (left) + Inter Co. A/c No (right) */
export function MasterFormNameAcNoRow({
  entityKind,
  entityId,
  mode = "edit",
  nameField,
}: {
  entityKind: InterCompanyEntityKind;
  entityId?: string | null;
  mode?: "create" | "edit";
  nameField: ReactNode;
}) {
  return (
    <div className={cn(masterFormTwoColClass, "col-span-full sm:col-span-full")}>
      {nameField}
      <MasterFormInterCompanyAcNoSlot entityKind={entityKind} entityId={entityId} mode={mode} />
    </div>
  );
}

export function MasterMobileNoField<T extends FieldValues>({
  control,
  name = "phone" as FieldPath<T>,
  placeholder = "Mobile number",
}: {
  control: Control<T>;
  name?: FieldPath<T>;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Mobile No.</FormLabel>
          <FormControl>
            <Input
              inputMode="tel"
              placeholder={placeholder}
              {...field}
              value={field.value == null ? "" : String(field.value)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
