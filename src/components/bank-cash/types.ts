
export type Account = {
  id: string;
  accountName: string;
  accountType: 'Bank' | 'Cash';
  openingBalance: number;
  openingBalanceDate?: any;
  /** OB ke saath text + multi-doc slots (Firestore) */
  openingBalanceNarration?: string;
  documentFileUrls?: string[];
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  isSpecial?: boolean;
  useFor?: {
    in: string[]; 
    out: string[];
  };
  balance: number; 
  companyId: string;
  ownerId: string;
  groupId?: string;
  debit: number;
  credit: number;
  fileUrl?: string;
  isDeleted?: boolean;
  isOwnerAccount?: boolean;
};

export type AccountGroup = {
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
