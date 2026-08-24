
export type Staff = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  salary?: number;
  openingBalance?: number;
  openingBalanceDate?: any;
  openingBalanceNarration?: string;
  documentFileUrls?: string[];
  salaryPeriod?: "Daily" | "Weekly" | "Monthly" | "Yearly";
  balance: number; 
  companyId: string;
  ownerId: string;
  groupId?: string;
  debit: number;
  credit: number;
  fileUrl?: string;
  isDeleted?: boolean;
  isFrozen?: boolean;
  freezeMessage?: string | null;
};

export type StaffGroup = {
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
