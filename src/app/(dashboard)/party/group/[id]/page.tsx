import { PartyGroupDetailsClient } from "./PartyGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function GroupDetailsPage() {
  return <PartyGroupDetailsClient />;
}
