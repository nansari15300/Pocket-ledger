/**
 * Ek company ke inter-company masters — Firestore (target column search ke liye).
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";

/** Company id par saare party/bank/staff/tax/expense rows */
export async function fetchInterCompanyEntitiesForCompany(
  companyId: string
): Promise<InterCompanyEntityDetail[]> {
  if (!companyId) return [];
  const cid = companyId;
  const [banks, parties, staff, taxes, expenses] = await Promise.all([
    getDocs(
      query(collection(firestore, `companies/${cid}/bank_accounts`), where("isDeleted", "==", false))
    ),
    getDocs(query(collection(firestore, `companies/${cid}/parties`), where("isDeleted", "==", false))),
    getDocs(query(collection(firestore, `companies/${cid}/staff`), where("isDeleted", "==", false))),
    getDocs(query(collection(firestore, `companies/${cid}/taxes`), where("isDeleted", "==", false))),
    getDocs(
      query(collection(firestore, `companies/${cid}/expense_accounts`), where("isDeleted", "==", false))
    ),
  ]);

  const rows: InterCompanyEntityDetail[] = [];
  banks.docs.forEach((d) => {
    const data = d.data() as {
      accountName?: string;
      bankName?: string;
      accountNumber?: string;
      phone?: string;
      interCompanyAccountNo?: string;
    };
    rows.push({
      id: d.id,
      kind: "bank",
      label: data.accountName || d.id,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      phone: data.phone,
      interCompanyAccountNo: data.interCompanyAccountNo,
    });
  });
  parties.docs.forEach((d) => {
    const data = d.data() as {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      pan?: string;
      fileUrl?: string | null;
      openingBalance?: number;
      interCompanyAccountNo?: string;
    };
    rows.push({
      id: d.id,
      kind: "party",
      label: data.name || d.id,
      phone: data.phone,
      email: data.email,
      address: data.address,
      pan: data.pan,
      fileUrl: data.fileUrl,
      openingBalance: data.openingBalance,
      interCompanyAccountNo: data.interCompanyAccountNo,
    });
  });
  staff.docs.forEach((d) => {
    const data = d.data() as {
      name?: string;
      phone?: string;
      email?: string;
      interCompanyAccountNo?: string;
      fileUrl?: string | null;
    };
    rows.push({
      id: d.id,
      kind: "staff",
      label: data.name || d.id,
      phone: data.phone,
      email: data.email,
      fileUrl: data.fileUrl,
      interCompanyAccountNo: data.interCompanyAccountNo,
    });
  });
  taxes.docs.forEach((d) => {
    const data = d.data() as { name?: string; interCompanyAccountNo?: string };
    rows.push({
      id: d.id,
      kind: "tax",
      label: data.name || d.id,
      interCompanyAccountNo: data.interCompanyAccountNo,
    });
  });
  expenses.docs.forEach((d) => {
    const data = d.data() as { name?: string; interCompanyAccountNo?: string };
    rows.push({
      id: d.id,
      kind: "expense",
      label: data.name || d.id,
      interCompanyAccountNo: data.interCompanyAccountNo,
    });
  });
  return rows;
}
