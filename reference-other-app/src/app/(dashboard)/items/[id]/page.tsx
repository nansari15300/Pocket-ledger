import { ItemDetailsClient } from "./ItemDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function ItemDetailsPage() {
  return <ItemDetailsClient />;
}
