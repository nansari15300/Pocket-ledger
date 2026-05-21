"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  IC_PARTNER_FIELD_LABELS,
  IC_PARTNER_FIELD_ORDER,
  PARTNER_SEARCH_DISABLED_FIELDS,
  PARTNER_VIEW_DISABLED_FIELDS,
  type InterCompanyPartnerFieldFlags,
  type InterCompanyPartnerFieldKey,
} from "@/lib/interCompany/interCompanyPartnerPrivacy";
import { interCompanySettingsCardClass } from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  searchBy: InterCompanyPartnerFieldFlags;
  viewFields: InterCompanyPartnerFieldFlags;
  maskInView: boolean;
  onSearchByChange: (key: InterCompanyPartnerFieldKey, checked: boolean) => void;
  onViewFieldsChange: (key: InterCompanyPartnerFieldKey, checked: boolean) => void;
  onMaskInViewChange: (checked: boolean) => void;
};

function FieldCheckboxRow({
  idPrefix,
  fieldKey,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  idPrefix: string;
  fieldKey: InterCompanyPartnerFieldKey;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <Checkbox
        id={`${idPrefix}-${fieldKey}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <Label
        htmlFor={`${idPrefix}-${fieldKey}`}
        className={cn(
          "font-normal leading-snug",
          disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"
        )}
      >
        {IC_PARTNER_FIELD_LABELS[fieldKey]}
      </Label>
    </li>
  );
}

/** Join tab — short partner search + view privacy checkboxes */
export function InterCompanyPartnerPrivacySettings({
  searchBy,
  viewFields,
  maskInView,
  onSearchByChange,
  onViewFieldsChange,
  onMaskInViewChange,
}: Props) {
  return (
    <div className="space-y-4">
      <div className={cn(interCompanySettingsCardClass, "space-y-2 p-3")}>
        <div>
          <Label className="text-sm font-medium">How partners find your accounts</Label>
          <p className="text-xs text-muted-foreground">
            Tick the fields other companies may use to search your accounts.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {IC_PARTNER_FIELD_ORDER.map((key) => {
            const searchDisabled = PARTNER_SEARCH_DISABLED_FIELDS.has(key);
            return (
              <FieldCheckboxRow
                key={`search-${key}`}
                idPrefix="ic-partner-search"
                fieldKey={key}
                checked={searchDisabled ? false : searchBy[key]}
                disabled={searchDisabled}
                onCheckedChange={(on) => onSearchByChange(key, on)}
              />
            );
          })}
        </ul>
      </div>

      <div className={cn(interCompanySettingsCardClass, "space-y-3 p-3")}>
        <div>
          <Label className="text-sm font-medium">What partners can see</Label>
          <p className="text-xs text-muted-foreground">
            Tick fields shown to other companies after they find an account.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {IC_PARTNER_FIELD_ORDER.map((key) => {
            const viewDisabled = PARTNER_VIEW_DISABLED_FIELDS.has(key);
            return (
              <FieldCheckboxRow
                key={`view-${key}`}
                idPrefix="ic-partner-view"
                fieldKey={key}
                checked={viewDisabled ? false : viewFields[key]}
                disabled={viewDisabled}
                onCheckedChange={(on) => onViewFieldsChange(key, on)}
              />
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0">
            <Label htmlFor="ic-partner-mask" className="text-sm font-medium">
              Mask in view
            </Label>
            <p className="text-xs text-muted-foreground">
              On: name / PAN / mobile — first & last 3 visible. A/c No always shows full.
            </p>
          </div>
          <Switch id="ic-partner-mask" checked={maskInView} onCheckedChange={onMaskInViewChange} />
        </div>
      </div>
    </div>
  );
}
