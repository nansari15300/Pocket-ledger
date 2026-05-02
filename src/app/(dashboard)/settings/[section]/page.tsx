import { redirect } from "next/navigation";

/** `settings/page.tsx` nav `id` — path `/settings/voucher` → `?view=voucher` taaki URL share + deep link sahi tab khule */
const SETTINGS_SECTION_IDS = new Set([
  "company",
  "sharing",
  "devices",
  "voucher",
  "theme",
  "animation",
  "id_settings",
  "decimals",
  "display",
  "fiscal_split",
  "notification",
  "danger-zone",
]);

// Static export (`output: export`) ke liye dynamic segment ke sab valid params build-time par dene zaroori hote hain.
const SETTINGS_SECTION_LIST = [
  "company",
  "sharing",
  "devices",
  "voucher",
  "theme",
  "animation",
  "id_settings",
  "decimals",
  "display",
  "fiscal_split",
  "notification",
  "danger-zone",
] as const;

type PageProps = {
  params: Promise<{ section: string }>;
};

export function generateStaticParams() {
  // `/settings/[section]` -> `/settings?view=<section>` redirect ke saare static paths pre-generate karo.
  return SETTINGS_SECTION_LIST.map((section) => ({ section }));
}

export default async function SettingsSectionRedirectPage({ params }: PageProps) {
  const { section } = await params;
  const s = (section || "").trim();
  if (!SETTINGS_SECTION_IDS.has(s)) redirect("/settings");
  redirect(`/settings?view=${encodeURIComponent(s)}`);
}
