/**
 * Email/password sirf current JS session me — logout par save-account encrypt ke liye.
 * Password kabhi localStorage me plain nahi likhte.
 */

const sessionPasswordByEmail = new Map<string, string>();

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** LoginForm successful email sign-in ke baad — logout save dialog ko password de sakta hai. */
export function stashSessionPasswordForSavedAccount(email: string, password: string): void {
  const e = normEmail(email);
  if (!e || !password) return;
  sessionPasswordByEmail.set(e, password);
}

export function peekSessionPasswordForSavedAccount(email: string): string | null {
  return sessionPasswordByEmail.get(normEmail(email)) ?? null;
}

export function takeSessionPasswordForSavedAccount(email: string): string | null {
  const key = normEmail(email);
  const v = sessionPasswordByEmail.get(key) ?? null;
  if (v) sessionPasswordByEmail.delete(key);
  return v;
}

export function clearSessionPasswordForSavedAccount(email: string): void {
  sessionPasswordByEmail.delete(normEmail(email));
}
