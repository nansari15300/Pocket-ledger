/**
 * Firebase getDownloadURL() links encode the object path; ref(storage, path) + getBlob
 * avoids flaky CORS fetch() for thumbnails (gallery vouchers often pass URL-only fileUrls).
 */

/** Forensic: `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` par path decode/normalize proof (cache-key audit). */
function attachmentPathForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/**
 * Parses standard Firebase Storage download URL and returns Storage object path
 * (e.g. `voucher-files/companyId/journal/174..._file.pdf`).
 * Host: `firebasestorage.googleapis.com` **or** `*.firebasestorage.app` (bucket DNS) — path `/v0/b/.../o/...` same.
 */
function decodeStorageObjectPathSegment(encoded: string): string {
  // + in query-less path segment can mean space in legacy encodings
  return decodeURIComponent(encoded.replace(/\+/g, " "));
}

/**
 * Signed / GCS-style URL: `https://storage.googleapis.com/<bucket>/<objectPath…>`
 * (kabhi `/v0/b/.../o/` format nahi hota) — bina iske `ref(storage, path)` miss = static/Electron par galat HTML blob + PDF preview blank.
 */
function tryGetObjectPathFromGoogleapisStyleUrl(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  // `bucket.storage.googleapis.com/voucher-files/...` — bucket hostname me, path = object
  if (host.endsWith(".storage.googleapis.com") && host !== "storage.googleapis.com") {
    const p = u.pathname.replace(/^\//, "");
    if (!p) return null;
    return decodeStorageObjectPathSegment(p);
  }
  if (host !== "storage.googleapis.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // `/bucketName/voucher-files/...` → object path bucket ke baad
  if (parts.length < 2) return null;
  const rest = parts.slice(1).join("/");
  if (!rest) return null;
  return decodeStorageObjectPathSegment(rest);
}

export function tryGetStoragePathFromFirebaseDownloadUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const withoutHash = url.trim().split("#")[0];
  let decoded: string | null = null;
  let parserNull = true;
  try {
    const u = new URL(withoutHash);
    const host = u.hostname.toLowerCase();
    const isFirebaseHost =
      host.includes("firebasestorage.googleapis.com") ||
      host.endsWith("firebasestorage.app") ||
      host.includes("storage.googleapis.com");
    if (!isFirebaseHost) {
      if (attachmentPathForensicEnabled()) {
        console.warn("[FORENSIC_FIREBASE_STORAGE_PARSE]", {
          phase: "tryGetStoragePathFromFirebaseDownloadUrl",
          rawValue: url,
          decodedPath: null,
          parserReturnedNull: true,
          reason: "host_not_firebase_storage",
          host,
        });
      }
      return null;
    }
    // Classic: /v0/b/<bucket>/o/<encodedPath> — `v1` kabhi deploy; sirf `v0` hardcode static build me miss ho sakta tha
    const m = u.pathname.match(/^\/v\d+\/b\/[^/]+\/o\/(.+)$/);
    if (m?.[1]) decoded = decodeStorageObjectPathSegment(m[1]);
    else {
      const gcs = tryGetObjectPathFromGoogleapisStyleUrl(u);
      if (gcs) decoded = gcs;
    }
    parserNull = decoded == null;
    if (attachmentPathForensicEnabled()) {
      console.warn("[FORENSIC_FIREBASE_STORAGE_PARSE]", {
        phase: "tryGetStoragePathFromFirebaseDownloadUrl",
        rawValue: url,
        withoutHash,
        decodedPath: decoded,
        pct2fInRaw: String(url).includes("%2F"),
        pct2fInDecoded: decoded != null && decoded.includes("%2F"),
        parserReturnedNull: parserNull,
        pathname: u.pathname,
      });
    }
    return decoded;
  } catch (e) {
    if (attachmentPathForensicEnabled()) {
      console.warn("[FORENSIC_FIREBASE_STORAGE_PARSE]", {
        phase: "tryGetStoragePathFromFirebaseDownloadUrl",
        rawValue: url,
        decodedPath: null,
        parserReturnedNull: true,
        reason: "url_parse_throw",
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }
}

/** Voucher attachment folders under `voucher-files/{companyId}/…` */
const VOUCHER_ATTACH_FOLDER_NAMES = new Set([
  "payment_out",
  "payment_in",
  "sale",
  "purchase",
  "direct_income",
  "direct_expense",
  "contra",
  "journal",
  "add_salary",
  "note",
  "inter_company",
  "inter_company_reverse",
  "sale_service",
  "purchase_service",
]);

export type NormalizeStoragePathOpts = { companyId?: string };

function decodeStoragePathCandidate(value: string): string {
  let d = String(value || "").trim();
  if (d.includes("%")) {
    try {
      d = decodeURIComponent(d);
    } catch {
      /* keep raw */
    }
  }
  return d.replace(/^\/+/, "");
}

function isKnownVoucherAttachFolder(segment: string): boolean {
  return VOUCHER_ATTACH_FOLDER_NAMES.has(String(segment || "").toLowerCase());
}

/** `generateCompanyId` → `slug_27e15173` — mirror tail `27e15173/...` se match */
function companyIdMatchesShortSuffix(companyId: string, suffix: string): boolean {
  const cid = String(companyId || "").trim();
  const suf = String(suffix || "").trim();
  if (!cid || !suf) return false;
  if (cid === suf) return true;
  return cid.endsWith(`_${suf}`);
}

/**
 * SQLite / mirror kabhi sirf tail store karta hai (`27e15173%2Fpayment_out%2F…`) — bina `voucher-files/` prefix ke
 * `getBlob(ref)` + offline cache lookup dono miss; gallery me JPG badge par bhi generic FILE icon.
 */
export function normalizeFirebaseStorageObjectPathForSdk(
  value: string,
  opts?: NormalizeStoragePathOpts
): string {
  const v = String(value || "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) {
    if (
      attachmentPathForensicEnabled() &&
      (v.includes("%2F") || /firebasestorage|storage\.googleapis\.com/i.test(v))
    ) {
      console.warn("[FORENSIC_FIREBASE_STORAGE_NORMALIZE]", {
        phase: "normalizeFirebaseStorageObjectPathForSdk",
        rawValue: value,
        normalizedPath: v,
        branch: "https_passthrough_unchanged",
        pct2fInRaw: v.includes("%2F"),
        pct2fInNormalized: v.includes("%2F"),
      });
    }
    return v;
  }
  if (/^voucher-files\//i.test(v) || /^companies\//i.test(v) || /^entity-files\//i.test(v)) {
    const out = v.replace(/^\/+/, "");
    if (attachmentPathForensicEnabled()) {
      console.warn("[FORENSIC_FIREBASE_STORAGE_NORMALIZE]", {
        phase: "normalizeFirebaseStorageObjectPathForSdk",
        rawValue: value,
        normalizedPath: out,
        branch: "already_prefixed_trim_leading_slash",
        pct2fInRaw: v.includes("%2F"),
        pct2fInNormalized: out.includes("%2F"),
      });
    }
    return out;
  }
  const d = decodeStoragePathCandidate(v);
  // Company UUID folder + voucher subpath → bucket root `voucher-files/…` (Storage rules ke hisaab se).
  const uuidThenSlash = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;
  if (uuidThenSlash.test(d)) {
    const out = `voucher-files/${d}`;
    if (attachmentPathForensicEnabled()) {
      console.warn("[FORENSIC_FIREBASE_STORAGE_NORMALIZE]", {
        phase: "normalizeFirebaseStorageObjectPathForSdk",
        rawValue: value,
        normalizedPath: out,
        branch: "uuid_prefix_voucher_files",
        pct2fInRaw: v.includes("%2F"),
        pct2fInNormalized: out.includes("%2F"),
      });
    }
    return out;
  }

  const parts = d.split("/").filter(Boolean);
  if (parts.length >= 2 && isKnownVoucherAttachFolder(parts[1])) {
    const companyId = String(opts?.companyId || "").trim();
    // Full doc id: `copy_test_27e15173/payment_out/file.jpg`
    if (parts[0].includes("_") || (companyId && parts[0] === companyId)) {
      const out = `voucher-files/${parts.join("/")}`;
      return out;
    }
    // EXE/SQLite mirror tail: `27e15173/payment_out/file.jpg` + active company `*_27e15173`
    if (companyId && companyIdMatchesShortSuffix(companyId, parts[0])) {
      return `voucher-files/${companyId}/${parts.slice(1).join("/")}`;
    }
  }

  if (attachmentPathForensicEnabled()) {
    console.warn("[FORENSIC_FIREBASE_STORAGE_NORMALIZE]", {
      phase: "normalizeFirebaseStorageObjectPathForSdk",
      rawValue: value,
      normalizedPath: v,
      branch: "passthrough_no_rule",
      pct2fInRaw: v.includes("%2F"),
      pct2fInNormalized: v.includes("%2F"),
    });
  }
  return v;
}

/** Voucher/entity attachment object path (without protocol) — e.g. `voucher-files/.../file.jpg`. */
export function looksLikeFirebaseStorageObjectPath(
  value: string,
  opts?: NormalizeStoragePathOpts
): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^(https?:|data:|blob:|local:|capacitor:|file:|drive:)/i.test(v)) return false;
  if (/^voucher-files\//i.test(v) || /^companies\//i.test(v) || /^entity-files\//i.test(v)) return true;
  const norm = normalizeFirebaseStorageObjectPathForSdk(v, opts);
  return (
    /^voucher-files\//i.test(norm) || /^companies\//i.test(norm) || /^entity-files\//i.test(norm)
  );
}
