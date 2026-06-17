import { redirect } from "next/navigation";

/** Gate screen decommissioned: company source is fixed to online in UI. */
export default function GatePage() {
  redirect("/company");
}
