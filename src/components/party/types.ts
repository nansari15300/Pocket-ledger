
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
  isInterCompanyCounterparty?: boolean;
  /** Linked peer company for IC clearing row (`ic_peer_*` / `ic_acct_*`). */
  interCompanyPeerCompanyId?: string;
  /** Peer company display name — Account→Account list wrap line. */
  interCompanyPeerCompanyName?: string;
  /** `company` = Company→Company; `account` = Account→Account. */
  interCompanyClearingMode?: "company" | "account";
  interCompanyPeerEntityKind?: string;
  interCompanyPeerEntityId?: string;
  interCompanyPeerEntityLabel?: string;
  isInterCompanyMirroredEntity?: boolean;
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
