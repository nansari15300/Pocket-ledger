import { BankAccountGroupDetailsClient } from "./BankAccountGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function BankAccountGroupDetailsPage() {
  return <BankAccountGroupDetailsClient />;
}
