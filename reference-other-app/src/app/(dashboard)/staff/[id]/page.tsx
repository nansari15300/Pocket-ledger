import { StaffDetailsClient } from "./StaffDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function StaffDetailsPage() {
  return <StaffDetailsClient />;
}
