/**

 * Har linked company ke liye IC counterparty party — `IC Com {peer name}` com-to-com ledger.

 */

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { firestore } from "@/lib/firebase";

import { interCompanyAcNoForNewEntity } from "@/lib/interCompany/interCompanyAccountNo";

import { formatInterCompanyCounterpartyPartyName } from "@/lib/interCompany/interCompanyCounterpartyPartyName";

import { restoreCompanySubdocFromRecycleBin } from "@/lib/recycleBinEntityLifecycle";

import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";

import { writeEntity } from "@/lib/writeGateway";

import { interCompanyUsesLocalLedgerTransport } from "@/lib/interCompany/localInterCompanyPolicy";



function counterpartyDocId(peerCompanyId: string): string {

  const safe = String(peerCompanyId || "")

    .trim()

    .replace(/[^a-zA-Z0-9_-]/g, "_")

    .slice(0, 48);

  return `ic_peer_${safe}`;

}



async function syncCounterpartyPartyDisplayName(

  companyId: string,

  docId: string,

  displayName: string,

  existingData: Record<string, unknown>

): Promise<void> {

  const currentName = String(existingData.name || "").trim();

  if (currentName === displayName) return;

  const patch = { name: displayName };

  if (await interCompanyUsesLocalLedgerTransport(companyId)) {

    const res = await writeEntity({

      companyId,

      collectionName: "parties",

      docId,

      operation: "update",

      data: patch,

    });

    if (res.ok === false) {

      console.warn("[IC] counterparty name sync failed:", res.error);

    }

    return;

  }

  try {

    await updateDoc(doc(firestore, `companies/${companyId}/parties`, docId), patch);

  } catch (err) {

    console.warn("[IC] counterparty name sync failed:", err);

  }

}



/** Source = sent (Dr); target = received (Cr) — same naam format dono taraf. */

export async function ensureInterCompanyCounterpartyParty(args: {

  companyId: string;

  peerCompanyId: string;

  peerCompanyName: string;

  side: "source" | "target";

  ownerId: string;

}): Promise<string> {

  const companyId = String(args.companyId || "").trim();

  const displayName = formatInterCompanyCounterpartyPartyName(args.peerCompanyName);

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

    await syncCounterpartyPartyDisplayName(companyId, docId, displayName, existingData);

    return docId;

  }



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



  if (await interCompanyUsesLocalLedgerTransport(companyId)) {

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


