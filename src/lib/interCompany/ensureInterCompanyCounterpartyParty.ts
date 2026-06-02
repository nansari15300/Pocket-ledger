/**
 * Har linked company ke liye IC counterparty party (Due from / Due to) — com-to-com ledger balance.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { interCompanyAcNoForNewEntity } from "@/lib/interCompany/interCompanyAccountNo";
import { restoreCompanySubdocFromRecycleBin } from "@/lib/recycleBinEntityLifecycle";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { writeEntity } from "@/lib/writeGateway";
import { apkEmbeddedSqliteFirstWritesPreferred } from "@/lib/apkOnlineFirestoreWritePolicy";

function counterpartyDocId(peerCompanyId: string): string {
  const safe = String(peerCompanyId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 48);
  return `ic_peer_${safe}`;
}

/** Source = Due from (asset); target = Due to (liability). */
export async function ensureInterCompanyCounterpartyParty(args: {
  companyId: string;
  peerCompanyId: string;
  peerCompanyName: string;
  side: "source" | "target";
  ownerId: string;
}): Promise<string> {
  const companyId = String(args.companyId || "").trim();
  const peerName = String(args.peerCompanyName || "Company").trim() || "Company";
  const docId = counterpartyDocId(args.peerCompanyId);
  const partyRef = doc(firestore, `companies/${companyId}/parties`, docId);
  const localRow = await getCompanyDocFromBrowserDb(companyId, "parties", docId);
  const existing = await getDoc(partyRef);
  const existingData = (localRow || (existing.exists() ? existing.data() : null)) as
    | Record<string, unknown>
    | null;
  if (existingData) {
    if (existingData.isDeleted === true) {
      await restoreCompanySubdocFromRecycleBin(companyId, "parties", docId);
    }
    return docId;
  }

  const displayName =
    args.side === "source" ? `IC · Due from ${peerName}` : `IC · Due to ${peerName}`;
  const groupId = args.side === "source" ? "sundry_debtors" : "sundry_creditors";
  const interCompanyAccountNo = await interCompanyAcNoForNewEntity("party");
  const body = {
    name: displayName,
    companyId,
    ownerId: args.ownerId || "",
    groupId,
    openingBalance: 0,
    balance: 0,
    debit: 0,
    credit: 0,
    isDeleted: false,
    isInterCompanyCounterparty: true,
    interCompanyPeerCompanyId: args.peerCompanyId,
    interCompanyCounterpartySide: args.side,
    interCompanyAccountNo,
  };

  if (apkEmbeddedSqliteFirstWritesPreferred()) {
    const res = await writeEntity({
      companyId,
      collectionName: "parties",
      docId,
      operation: "create",
      data: body,
    });
    if (res.ok === false) throw new Error(res.error || "Failed to create IC counterparty party");
    return docId;
  }

  await setDoc(partyRef, { ...body, createdAt: new Date() });
  return docId;
}
