export type QuotationMasterKind = "party" | "bank" | "staff" | "tax" | "expense" | "item";

export type QuotationFormTabId = "letter" | "tab2" | "tab3" | "tab4" | "tab5";

export type QuotationLetterLang = "en" | "ne" | "hi";

export type QuotationPanLabelKind = "vat" | "gstin" | "pan";

export type QuotationPhoneLabelKind = "short" | "mid" | "full";

export type QuotationPageFlow = "bottom" | "right";

export type QuotationPageImage = {
  id: string;
  pageIndex: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Clockwise degrees (0, 90, 180, 270). */
  rotation?: number;
};

export type QuotationTableCol = "num" | "item" | "qty" | "rate" | "tax" | "taxAmt" | "amount";

export type QuotationTableTextStyle = {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
};

export type QuotationTableColStyles = Partial<Record<QuotationTableCol, QuotationTableTextStyle>>;

export type QuotationTableCellTarget =
  | { kind: "header"; col: QuotationTableCol }
  | { kind: "body"; rowId: string; col: QuotationTableCol }
  | { kind: "words" };

export type QuotationLineItem = {
  id: string;
  type: "item" | "service";
  itemId: string;
  itemName: string;
  quantity: number;
  rate: number;
  unit: string;
  taxPercent: number;
  amount: number;
  cellStyles?: QuotationTableColStyles;
};

export type QuotationLetterhead = {
  panLabel: string;
  pan: string;
  phoneLabel: string;
  phone: string;
  companyName: string;
  address: string;
  logoUrl: string | null;
  companyNameFontSize: number;
  addressFontSize: number;
};

export type QuotationDoc = {
  id: string;
  companyId: string;
  quotationNumber: string;
  dateIso: string;
  accountId: string;
  accountKind: QuotationMasterKind;
  accountName: string;
  recipientName: string;
  subject: string;
  letterhead: QuotationLetterhead;
  bodyHtml: string;
  extraPagesHtml: string[];
  gapHtml?: string;
  extraGapHtml?: string[];
  tailHtml?: string;
  extraTailHtml?: string[];
  bodyHeightPx?: number;
  extraBodyHeights?: number[];
  pageImages: QuotationPageImage[];
  pageFlow: QuotationPageFlow;
  numberLabelLang?: QuotationLetterLang;
  subjectLabelLang?: QuotationLetterLang;
  dateLabelLang?: QuotationLetterLang;
  amountWordsLang?: QuotationLetterLang;
  amountWordsFontSize?: number;
  amountWordsColor?: string;
  tableHeaderStyles?: QuotationTableColStyles;
  panLabelLang?: QuotationLetterLang;
  panLabelKind?: QuotationPanLabelKind;
  phoneLabelLang?: QuotationLetterLang;
  phoneLabelKind?: QuotationPhoneLabelKind;
  lineItems: QuotationLineItem[];
  convertedSaleId?: string;
  convertedSaleNumber?: string;
  amount: number;
  tabId: QuotationFormTabId;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  isDeleted?: boolean;
  deletedAt?: number | null;
  deletedBy?: string;
};

export type QuotationAccountRow = {
  id: string;
  accountId: string;
  kind: QuotationMasterKind;
  name: string;
  fileUrl?: string | null;
  quotationCount: number;
};

export type QuotationMasterOption = {
  id: string;
  kind: QuotationMasterKind;
  name: string;
  fileUrl?: string | null;
};

export type QuotationDraft = {
  id?: string;
  quotationNumber: string;
  dateIso: string;
  accountId: string;
  accountKind: QuotationMasterKind | "";
  accountName: string;
  recipientName: string;
  subject: string;
  letterhead: QuotationLetterhead;
  bodyHtml: string;
  extraPagesHtml: string[];
  gapHtml?: string;
  extraGapHtml?: string[];
  tailHtml?: string;
  extraTailHtml?: string[];
  bodyHeightPx?: number;
  extraBodyHeights?: number[];
  pageImages: QuotationPageImage[];
  pageFlow: QuotationPageFlow;
  numberLabelLang: QuotationLetterLang;
  subjectLabelLang: QuotationLetterLang;
  dateLabelLang: QuotationLetterLang;
  amountWordsLang: QuotationLetterLang;
  amountWordsFontSize?: number;
  amountWordsColor?: string;
  tableHeaderStyles?: QuotationTableColStyles;
  panLabelLang: QuotationLetterLang;
  panLabelKind: QuotationPanLabelKind;
  phoneLabelLang: QuotationLetterLang;
  phoneLabelKind: QuotationPhoneLabelKind;
  lineItems: QuotationLineItem[];
  convertedSaleId?: string;
  convertedSaleNumber?: string;
  amount: number;
  tabId: QuotationFormTabId;
};
