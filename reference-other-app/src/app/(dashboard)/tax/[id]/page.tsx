import { TaxDetailsClient } from "./TaxDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function TaxDetailsPage() {
  return <TaxDetailsClient />;
}
