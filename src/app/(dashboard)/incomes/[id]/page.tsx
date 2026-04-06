import { ExpenseAccountDetailsClient } from "./ExpenseAccountDetailsClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function ExpenseAccountDetailsPage() {
  return <ExpenseAccountDetailsClient />;
}
