
'use server';

import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { FieldValue } from 'firebase-admin/firestore';


export async function restoreCompany(companyId: string) {
  try {
    const db = getAdminDb();
    const companyRef = db.collection('companies').doc(companyId);
    await companyRef.update({
      isDeleted: false,
      deletedAt: null,
      movedToAdminRecycleAt: FieldValue.delete()
    });
    return { success: true };
  } catch (error: any) {
    console.error("Restore from server action failed:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteCompanyComplete(companyId: string, userId: string) {
  try {
    const db = getAdminDb();
    const adminApp = getAdminApp();

    // 1. Firebase Storage folder delete
    const bucket = getAdminStorage(adminApp).bucket();
    const folderPath = `companies/${companyId}`;
    try {
      await bucket.deleteFiles({ prefix: folderPath });
    } catch (storageError) {
        console.warn("Storage cleanup notice (might be empty):", storageError);
    }
    
    // 2. Delete all subcollections
    const subcollections = [
      'vouchers', 
      'bank_accounts', 
      'account_groups', 
      'items',
      'item_groups',
      'parties',
      'groups',
      'staff', 
      'staff_groups',
      'unassigned_documents',
      'taxes',
      'tax_groups',
      'expense_accounts',
      'expense_groups'
    ];
    
    for (const sub of subcollections) {
      const subRef = db.collection(`companies/${companyId}/${sub}`);
      const snapshot = await subRef.get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 3. Delete main company document
    await db.collection("companies").doc(companyId).delete();

    return { success: true };
  } catch (error: any) {
    console.error("Critical Delete Error:", error);
    return { success: false, error: error.message };
  }
}
