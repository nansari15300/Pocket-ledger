import { BankAccountDetailsClient } from "./BankAccountDetailsClient";

/** Static export: no pre-rendered paths for [id] (Gallery-only APK) */
export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function BankAccountDetailsPage() {
  return <BankAccountDetailsClient />;
}
