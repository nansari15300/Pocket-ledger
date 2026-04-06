import { ItemGroupDetailsClient } from "./ItemGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function ItemGroupDetailsPage() {
  return <ItemGroupDetailsClient />;
}
