import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

/** Inter-company entity row — picker + details card + mobile search */
export type InterCompanyEntityDetail = {
  id: string;
  kind: InterCompanyEntityKind;
  label: string;
  phone?: string;
  email?: string;
  address?: string;
  pan?: string;
  fileUrl?: string | null;
  openingBalance?: number;
  /** Source column — voucher aggregates se closing (target par mat dikhao) */
  closingBalance?: number;
  bankName?: string;
  accountNumber?: string;
  /** P/B/S/T/E prefixed Inter Co. A/c No */
  interCompanyAccountNo?: string;
};
