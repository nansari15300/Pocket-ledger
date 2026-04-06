import { TaxGroupDetailsClient } from "./TaxGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function TaxGroupDetailsPage() {
  return <TaxGroupDetailsClient />;
}
