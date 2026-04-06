import { ExpenseGroupDetailsClient } from "./ExpenseGroupDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function ExpenseGroupDetailsPage() {
  return <ExpenseGroupDetailsClient />;
}
