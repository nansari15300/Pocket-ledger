
export type Party = {
  id: string;
  name: string;
  openingBalance: number;
  openingBalanceDate?: any;
  openingBalanceNarration?: string;
  documentFileUrls?: string[];
  debit: number;
  credit: number;
  balance: number;
  companyId: string;
  groupId?: string;
  fileUrl?: string;
  address?: string;
  pan?: string;
  phone?: string;
  email?: string;
  isDeleted?: boolean;
};

export type Group = {
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
