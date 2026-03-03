/**
 * Local + Online data schema – EXE/APK मा device मा save तथा online (Firestore) दुवैको लागि।
 * SQLite / IndexedDB table structure र shared types; data layer ले यही schema use गर्छ।
 */

/** Company को storage type – create गर्दा रोजिन्छ। */
export type CompanyStorageType = "online" | "offline";

/** Local DB table names (SQLite वा IndexedDB object stores). */
export const LOCAL_TABLES = {
  companies: "companies",
  vouchers: "vouchers",
  parties: "parties",
  groups: "groups",
  account_groups: "account_groups",
  expense_groups: "expense_groups",
  staff_groups: "staff_groups",
  tax_groups: "tax_groups",
  accounts: "accounts",
  items: "items",
  taxes: "taxes",
  voucher_settings: "voucher_settings",
} as const;

/** Company document – local वा online दुवैमा समान shape। */
export interface LocalCompany {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  storageType: CompanyStorageType;
  address?: string;
  phone?: string;
  email?: string;
  pan?: string;
  country: string;
  logoUrl?: string | null;
  fiscalYearStart?: number | null;
  fiscalYearEnd?: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Voucher – local वा online। */
export interface LocalVoucher {
  id: string;
  companyId: string;
  type: string;
  voucherNumber?: string;
  date: number;
  partyId?: string | null;
  amount?: number;
  description?: string | null;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** Party – local वा online। */
export interface LocalParty {
  id: string;
  companyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  groupId?: string | null;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** Account – local वा online। */
export interface LocalAccount {
  id: string;
  companyId: string;
  name: string;
  groupId: string;
  type: string;
  openingBalance?: number;
  openingBalanceUnit?: string | null;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** SQLite CREATE TABLE statements (भविष्यमा use गर्न)। */
export const LOCAL_SQL_SCHEMA = `
-- Companies (offline / local cache)
CREATE TABLE IF NOT EXISTS ${LOCAL_TABLES.companies} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  ownerEmail TEXT,
  storageType TEXT NOT NULL DEFAULT 'online',
  address TEXT,
  phone TEXT,
  email TEXT,
  pan TEXT,
  country TEXT NOT NULL,
  logoUrl TEXT,
  fiscalYearStart INTEGER,
  fiscalYearEnd INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Vouchers (per company)
CREATE TABLE IF NOT EXISTS ${LOCAL_TABLES.vouchers} (
  id TEXT NOT NULL,
  companyId TEXT NOT NULL,
  type TEXT NOT NULL,
  voucherNumber TEXT,
  date INTEGER NOT NULL,
  partyId TEXT,
  amount REAL,
  description TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY (companyId, id)
);

-- Parties (per company)
CREATE TABLE IF NOT EXISTS ${LOCAL_TABLES.parties} (
  id TEXT NOT NULL,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  groupId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY (companyId, id)
);

-- Accounts (per company)
CREATE TABLE IF NOT EXISTS ${LOCAL_TABLES.accounts} (
  id TEXT NOT NULL,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  groupId TEXT NOT NULL,
  type TEXT NOT NULL,
  openingBalance REAL,
  openingBalanceUnit TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY (companyId, id)
);
`.trim();
