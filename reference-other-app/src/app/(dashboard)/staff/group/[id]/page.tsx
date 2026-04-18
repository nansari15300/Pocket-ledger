import { StaffGroupDetailsClient } from "./StaffGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function StaffGroupDetailsPage() {
  return <StaffGroupDetailsClient />;
}
