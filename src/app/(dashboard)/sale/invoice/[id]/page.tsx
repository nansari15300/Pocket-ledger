import { InvoicePageClient } from "./InvoicePageClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function InvoicePage() {
  return <InvoicePageClient />;
}
