"use client";

type DebugInput = {
  page: string;
  operation: "get" | "list" | "count" | "create" | "update" | "delete" | "unknown";
  path: string;
  error: unknown;
};

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code?: unknown }).code ?? "unknown");
  }
  return "unknown";
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return "Unknown error";
}

function inferRuleHint(path: string, operation: DebugInput["operation"]): string {
  if (path.includes("/companies/") && path.includes("/vouchers")) {
    if (operation === "get" || operation === "list" || operation === "count") {
      return "Rule hint: need company access (owner/shared/admin/super-admin email) for vouchers read/list.";
    }
    return "Rule hint: vouchers write requires isCompanyUser(companyId).";
  }

  if (path.includes("/companies/")) {
    if (path.split("/").length <= 2) {
      return "Rule hint: company doc get/list requires owner/sharedWithEmails/handover/admin.";
    }
    return "Rule hint: company subcollections require isCompanyUser(companyId).";
  }

  if (path.includes("/users/")) {
    return "Rule hint: user docs/subcollections are ownership-based (auth.uid + path/data checks).";
  }

  return "Rule hint: check firestore.rules match block for this path and operation.";
}

export function logFirestorePermissionDenied(input: DebugInput): void {
  const code = getErrorCode(input.error);
  if (code !== "permission-denied") return;

  const message = getErrorMessage(input.error);
  const hint = inferRuleHint(input.path, input.operation);

  // Single structured log to quickly trace where/why denied.
  console.error("[Firestore Rules][Permission Denied]", {
    page: input.page,
    operation: input.operation,
    path: input.path,
    code,
    message,
    hint,
  });
}

