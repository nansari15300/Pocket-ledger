import { PartyDetailsClient } from "./PartyDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function PartyDetailsPage() {
  return <PartyDetailsClient />;
}
