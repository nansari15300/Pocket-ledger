
export type ExpenseAccount = {
    id: string;
    name: string;
    debit: number;
    credit: number;
    balance: number;
    groupId?: string;
    openingBalance?: number;
    openingBalanceDate?: any;
    openingBalanceNarration?: string;
    fileUrl?: string;
    documentFileUrls?: string[];
    phone?: string;
    isDeleted?: boolean;
    type?: 'Income' | 'Expense' | 'Salary';
};

export type ExpenseGroup = {
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
