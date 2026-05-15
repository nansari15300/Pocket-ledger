"use client";

/**
 * Helpers for create/update/delete of company subcollection docs (parties, bank_accounts,
 * groups, staff, taxes, items, expense_accounts, etc.) and company document.
 * When data source is Local, writes go to local API; otherwise callers use Firestore.
 */

import { getLocalApiClientForWrite, toLocalPayload } from "@/lib/localApiClient";

export type CompanyCollection =
  | "parties"
  | "groups"
  | "bank_accounts"
  | "account_groups"
  | "staff"
  | "staff_groups"
  | "taxes"
  | "tax_groups"
  | "items"
  | "item_groups"
  | "expense_accounts"
  | "expense_groups";

/**
 * Create a doc in a company subcollection. When in local mode, writes via local API and
 * returns { id }. Otherwise returns null and caller should use Firestore addDoc.
 */
export async function createCompanyDoc(
  companyId: string,
  collection: CompanyCollection,
  data: Record<string, unknown>
): Promise<{ id: string } | null> {
  const client = getLocalApiClientForWrite();
  if (!client) return null;
  const payload = toLocalPayload(data) as Record<string, unknown>;
  const created = await client.createDoc(companyId, collection, payload);
  return { id: (created as { id: string }).id };
}

/**
 * Update a doc in a company subcollection. When in local mode, writes via local API and
 * returns true. Otherwise returns false and caller should use Firestore updateDoc.
 */
export async function updateCompanyDoc(
  companyId: string,
  collection: CompanyCollection,
  docId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const client = getLocalApiClientForWrite();
  if (!client) return false;
  const payload = toLocalPayload(data) as Record<string, unknown>;
  await client.updateDoc(companyId, collection, docId, payload);
  return true;
}

/**
 * Delete a doc in a company subcollection. When in local mode, deletes via local API and
 * returns true. Otherwise returns false and caller should use Firestore deleteDoc.
 */
export async function deleteCompanyDoc(
  companyId: string,
  collection: CompanyCollection,
  docId: string
): Promise<boolean> {
  const client = getLocalApiClientForWrite();
  if (!client) return false;
  await client.deleteDoc(companyId, collection, docId);
  return true;
}

/**
 * Update the company document (settings, display, voucher, notification, sharing, etc.).
 * When in local mode, writes via local API and returns true. Otherwise returns false and
 * caller should use Firestore updateDoc on company ref.
 */
export async function updateCompanyDocRoot(
  companyId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const client = getLocalApiClientForWrite();
  if (!client) return false;
  const payload = toLocalPayload(data) as Record<string, unknown>;
  await client.updateCompany(companyId, payload);
  return true;
}
