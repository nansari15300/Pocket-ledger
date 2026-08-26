import { LoanIdRouteClient } from "./LoanIdRouteClient";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function LoanIdRoutePage() {
  return <LoanIdRouteClient />;
}
