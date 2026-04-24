import { Suspense } from "react";
import { ItemDetailsClient } from "./ItemDetailsClient";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";

export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function ItemDetailsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ItemDetailsClient />
    </Suspense>
  );
}
