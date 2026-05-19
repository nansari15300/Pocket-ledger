"use client";

/**
 * Inter-company: ek company column — entity type + pick (party, bank, staff, tax, ledger).
 */
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type InterCompanyEntityKind = "party" | "bank" | "staff" | "tax" | "expense";

export const INTER_COMPANY_ENTITY_LABELS: Record<InterCompanyEntityKind, string> = {
  party: "Party",
  bank: "Bank / Cash",
  staff: "Staff",
  tax: "Tax",
  expense: "Income / Expense ledger",
};

type EntityRow = {
  id: string;
  kind: InterCompanyEntityKind;
  label: string;
};

type InterCompanyEntitySideProps = {
  title: string;
  subtitle?: string;
  className?: string;
  entities: EntityRow[];
  entityKind: InterCompanyEntityKind;
  onEntityKindChange: (k: InterCompanyEntityKind) => void;
  entityId: string;
  onEntityIdChange: (id: string) => void;
  disabled?: boolean;
  /** Target column: sirf entity rows — company name / subtitle header hide */
  hideHeader?: boolean;
  /** Journal single-row label jab hideHeader */
  entityRowLabel?: string;
  /** Direct transfer: ek row — party, bank, staff, tax, ledger (bank alag row nahi) */
  entityRows?: {
    payeeKind: InterCompanyEntityKind;
    onPayeeKindChange: (k: InterCompanyEntityKind) => void;
    payeeId: string;
    onPayeeIdChange: (id: string) => void;
    rowLabel?: string;
  };
};

function optionsForKind(entities: EntityRow[], kind: InterCompanyEntityKind) {
  return entities
    .filter((e) => e.kind === kind)
    .map((e) => ({ value: e.id, label: e.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function EntityKindSelect({
  value,
  onChange,
  disabled,
  lockKind,
}: {
  value: InterCompanyEntityKind;
  onChange: (k: InterCompanyEntityKind) => void;
  disabled?: boolean;
  lockKind?: InterCompanyEntityKind;
}) {
  if (lockKind) {
    return (
      <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
        {INTER_COMPANY_ENTITY_LABELS[lockKind]}
      </div>
    );
  }
  return (
    <Select value={value} onValueChange={(v) => onChange(v as InterCompanyEntityKind)} disabled={disabled}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Entity type" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(INTER_COMPANY_ENTITY_LABELS) as InterCompanyEntityKind[]).map((k) => (
          <SelectItem key={k} value={k}>
            {INTER_COMPANY_ENTITY_LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EntityRowFields({
  rowLabel,
  entities,
  entityKind,
  onEntityKindChange,
  entityId,
  onEntityIdChange,
  disabled,
  lockKind,
}: {
  rowLabel: string;
  entities: EntityRow[];
  entityKind: InterCompanyEntityKind;
  onEntityKindChange: (k: InterCompanyEntityKind) => void;
  entityId: string;
  onEntityIdChange: (id: string) => void;
  disabled?: boolean;
  lockKind?: InterCompanyEntityKind;
}) {
  const kind = lockKind ?? entityKind;
  const opts = optionsForKind(entities, kind);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{rowLabel}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(7rem,9rem)_1fr]">
        <EntityKindSelect
          value={kind}
          onChange={onEntityKindChange}
          disabled={disabled}
          lockKind={lockKind}
        />
        <Combobox
          options={opts}
          value={entityId}
          onChange={onEntityIdChange}
          placeholder={`Select ${INTER_COMPANY_ENTITY_LABELS[kind].toLowerCase()}`}
          disabled={disabled || opts.length === 0}
        />
      </div>
    </div>
  );
}

export function InterCompanyEntitySide({
  title,
  subtitle,
  className,
  entities,
  entityKind,
  onEntityKindChange,
  entityId,
  onEntityIdChange,
  disabled,
  hideHeader,
  entityRowLabel,
  entityRows,
}: InterCompanyEntitySideProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-3", className)}>
      {!hideHeader ? (
        <div className="border-b pb-2">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
      ) : null}

      {entityRows ? (
        <EntityRowFields
          rowLabel={entityRows.rowLabel ?? "Account"}
          entities={entities}
          entityKind={entityRows.payeeKind}
          onEntityKindChange={entityRows.onPayeeKindChange}
          entityId={entityRows.payeeId}
          onEntityIdChange={entityRows.onPayeeIdChange}
          disabled={disabled}
        />
      ) : (
        <EntityRowFields
          rowLabel={entityRowLabel ?? "Entity"}
          entities={entities}
          entityKind={entityKind}
          onEntityKindChange={onEntityKindChange}
          entityId={entityId}
          onEntityIdChange={onEntityIdChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
