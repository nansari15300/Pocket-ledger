/**

 * Firestore `sharedWithEmails` `array-contains` is case-sensitive.

 * `sharedWithEmailsLower` stores lowercase only — query + rules align reliably.

 */

export function toSharedWithEmailsLower(email: string): string {

  return String(email || "").trim().toLowerCase();

}



export function sharedWithEmailQueryVariants(email: string | null | undefined): string[] {

  const raw = String(email || "").trim();

  if (!raw) return [];

  const lower = raw.toLowerCase();

  if (lower === raw) return [lower];

  return [lower, raw];

}



export function sharedWithEmailsLowerFromList(emails: string[]): string[] {

  return [...new Set(emails.map((e) => toSharedWithEmailsLower(e)).filter(Boolean))];

}



export type SharedCompanyQuerySpec = {

  field: "sharedWithEmails" | "sharedWithEmailsLower";

  value: string;

};



/** Firestore shared-company listeners: lowercase field + legacy casing variants. */

export function sharedCompanyQuerySpecs(email: string | null | undefined): SharedCompanyQuerySpec[] {

  const lower = toSharedWithEmailsLower(email || "");

  if (!lower) return [];

  const specs: SharedCompanyQuerySpec[] = [{ field: "sharedWithEmailsLower", value: lower }];

  for (const variant of sharedWithEmailQueryVariants(email)) {

    if (!specs.some((s) => s.field === "sharedWithEmails" && s.value === variant)) {

      specs.push({ field: "sharedWithEmails", value: variant });

    }

  }

  return specs;

}



export function sharedCompanyQueryKey(spec: SharedCompanyQuerySpec): string {

  return `${spec.field}:${spec.value}`;

}


