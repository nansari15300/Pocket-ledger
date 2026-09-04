
export type Tax = {
  id: string;
  name: string;
  rate: number;
  balance: number; 
  companyId: string;
  ownerId?: string;
  groupId?: string;
  debit: number;
  credit: number;
  fileUrl?: string;
  isDeleted?: boolean;
  openingBalance?: number;
  openingBalanceDate?: any;
  openingBalanceNarration?: string;
  documentFileUrls?: string[];
  phone?: string;
  whatsapp?: boolean;
  isFrozen?: boolean;
  freezeMessage?: string | null;
  anusuchi13ConfirmationByFy?: Record<string, { sent?: boolean; completed?: boolean; statementSent?: boolean }>;
};

export type TaxGroup = {
    id: string;
    name: string;
    companyId: string;
    parentId?: string;
    debit: number;
    credit: number;
    balance: number;
    openingBalance?: number;
    isDeleted?: boolean;
};
