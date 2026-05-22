import ReconciliationPageClient from "./ReconciliationPageClient";

// Static export (APK): placeholder route; real shareId client-side via useParams
export async function generateStaticParams() {
  return [{ shareId: "__placeholder__" }];
}

export default function ReconciliationSharePage() {
  return <ReconciliationPageClient />;
}
