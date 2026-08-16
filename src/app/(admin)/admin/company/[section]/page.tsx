import { notFound } from "next/navigation";
import { AdminPanelEntityWorkspace } from "@/adminPanelCompany/components/AdminPanelEntityWorkspace";
import {
  ADMIN_PANEL_ENTITY_KINDS,
  type AdminPanelEntityKind,
} from "@/lib/adminPanelCompany/constants";

export default async function AdminCompanySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!(ADMIN_PANEL_ENTITY_KINDS as readonly string[]).includes(section)) notFound();
  return <AdminPanelEntityWorkspace kind={section as AdminPanelEntityKind} />;
}
