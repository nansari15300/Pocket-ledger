import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";
import {
  ADMIN_PANEL_COMPANIES_COLLECTION,
  ADMIN_PANEL_ENTITY_KINDS,
  CLOUD_ADMIN_PANEL_TENANT_ID,
  type AdminPanelEntityKind,
} from "@/lib/adminPanelCompany/constants";

function isEntityKind(value: string): value is AdminPanelEntityKind {
  return (ADMIN_PANEL_ENTITY_KINDS as readonly string[]).includes(value);
}

async function requireSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: "Missing Authorization Bearer token", status: 401 } as const;
  getAdminDb();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!(await isSuperAdminServer(decoded.uid, decoded.email ?? undefined))) {
      return { error: "SuperAdmin only", status: 403 } as const;
    }
    return { decoded } as const;
  } catch {
    return { error: "Invalid auth token", status: 401 } as const;
  }
}

function readKind(req: NextRequest) {
  const kind = String(req.nextUrl.searchParams.get("kind") || "").trim();
  return isEntityKind(kind) ? kind : null;
}

function stringField(body: Record<string, unknown>, field: string, max = 240) {
  return String(body[field] ?? "").trim().slice(0, max);
}

function amountField(body: Record<string, unknown>, field: string) {
  const n = Number(body[field]);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function buildEntity(kind: AdminPanelEntityKind, body: Record<string, unknown>) {
  const common = {
    tenantId: CLOUD_ADMIN_PANEL_TENANT_ID,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (kind === "parties") {
    const name = stringField(body, "name");
    if (!name) return { error: "Subscriber/party name is required" } as const;
    return {
      value: {
        ...common,
        name,
        email: stringField(body, "email"),
        phone: stringField(body, "phone", 48),
        address: stringField(body, "address", 500),
        openingBalance: amountField(body, "openingBalance"),
        type: "subscriber",
      },
    };
  }
  if (kind === "bank_accounts") {
    const name = stringField(body, "name");
    if (!name) return { error: "Account name is required" } as const;
    const accountType = stringField(body, "accountType", 16) || "Bank";
    return {
      value: {
        ...common,
        name,
        accountType: accountType === "Cash" ? "Cash" : "Bank",
        bankName: stringField(body, "bankName"),
        accountNumber: stringField(body, "accountNumber", 80),
        openingBalance: amountField(body, "openingBalance"),
        type: accountType === "Cash" ? "cash" : "bank",
      },
    };
  }
  if (kind === "staff") {
    const name = stringField(body, "name");
    if (!name) return { error: "Staff name is required" } as const;
    return {
      value: {
        ...common,
        name,
        email: stringField(body, "email"),
        phone: stringField(body, "phone", 48),
        address: stringField(body, "address", 500),
        role: stringField(body, "role") || "accountant",
        salary: amountField(body, "salary"),
        salaryPeriod: stringField(body, "salaryPeriod", 24) || "Monthly",
      },
    };
  }
  if (kind === "taxes") {
    const name = stringField(body, "name");
    if (!name) return { error: "Tax name is required" } as const;
    return {
      value: {
        ...common,
        name,
        rate: Math.min(100, amountField(body, "rate")),
      },
    };
  }
  if (kind === "expense_accounts") {
    const name = stringField(body, "name");
    if (!name) return { error: "Expense account name is required" } as const;
    return { value: { ...common, name, type: "expense" } };
  }

  const narration = stringField(body, "narration", 500);
  const amount = amountField(body, "amount");
  const voucherType = stringField(body, "voucherType", 40) || "manual";
  if (!narration || amount <= 0) {
    return { error: "Voucher narration and amount are required" } as const;
  }
  return {
    value: {
      ...common,
      kind: "manual-adjustment",
      voucherType,
      status: "posted",
      systemGenerated: false,
      locked: false,
      narration,
      amount,
      partyId: stringField(body, "partyId", 120),
      partyName: stringField(body, "partyName"),
      staffId: stringField(body, "staffId", 120),
      staffName: stringField(body, "staffName"),
      bankAccountId: stringField(body, "bankAccountId", 120),
      bankAccountName: stringField(body, "bankAccountName"),
      debitAccount: stringField(body, "debitAccount") || "gateway-clearing",
      creditAccount: stringField(body, "creditAccount") || "subscription-sales",
      postedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const kind = readKind(req);
  if (!kind) return NextResponse.json({ error: "Invalid entity kind" }, { status: 400 });

  const ref = getAdminDb()
    .collection(ADMIN_PANEL_COMPANIES_COLLECTION)
    .doc(CLOUD_ADMIN_PANEL_TENANT_ID)
    .collection(kind);
  const snap = await ref.orderBy("createdAt", "desc").limit(200).get();
  const rows = snap.docs.map((row) => {
    const data = row.data();
    const createdAt = data.createdAt as admin.firestore.Timestamp | undefined;
    return { id: row.id, ...data, createdAtMs: createdAt?.toMillis?.() ?? null };
  });
  return NextResponse.json({ kind, rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const kind = readKind(req);
  if (!kind) return NextResponse.json({ error: "Invalid entity kind" }, { status: 400 });

  const companyRef = getAdminDb().collection(ADMIN_PANEL_COMPANIES_COLLECTION).doc(CLOUD_ADMIN_PANEL_TENANT_ID);
  if (!(await companyRef.get()).exists) {
    return NextResponse.json({ error: "Create Admin Panel Company first" }, { status: 409 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const entity = buildEntity(kind, body);
  if ("error" in entity) return NextResponse.json({ error: entity.error }, { status: 400 });

  const ref = await companyRef.collection(kind).add({
    ...entity.value,
    createdByUid: auth.decoded.uid,
  });
  return NextResponse.json({ id: ref.id, kind }, { status: 201 });
}
