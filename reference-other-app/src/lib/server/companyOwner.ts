import type * as admin from "firebase-admin";

/** Same rules as extend-plan-expiry: UID match or normalized email match. */
export function isCompanyOwner(
  decoded: admin.auth.DecodedIdToken,
  data: { ownerId?: string; ownerEmail?: string }
): boolean {
  const ownerEmail = String(data.ownerEmail || "")
    .toLowerCase()
    .trim();
  const callerEmail = String(decoded.email || "")
    .toLowerCase()
    .trim();
  const isOwnerByUid = !!data.ownerId && data.ownerId === decoded.uid;
  const isOwnerByEmail = !!ownerEmail && !!callerEmail && ownerEmail === callerEmail;
  return isOwnerByUid || isOwnerByEmail;
}
