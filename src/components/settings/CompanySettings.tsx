
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CreateCompanyForm } from "@/components/company/CreateCompanyForm";
import { EditCompanyForm } from "@/components/company/EditCompanyForm";
import { ForceUploadLocalDataButton } from "@/components/company/ForceUploadLocalDataButton";
import { UploadCompanyToCloudCard } from "@/components/company/UploadCompanyToCloudCard";
import { useCompany } from "@/hooks/useCompany";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import {
  companyProfileChromeRoot,
  companyProfileGreenZone,
  companyProfilePageBg,
  companyProfileTabsList,
  companyProfileTabsTrigger,
} from "@/lib/companyProfileChrome";

export function CompanySettings({ readOnly = false }: { readOnly?: boolean }) {
  const { company, setCompanyId } = useCompany();
  const router = useRouter();
  // Title ke bagal: ----> + selected company naam (sidebar switch par update)
  const selectedCompanyName = String(company?.name || "").trim();

  const handleCompanyCreated = (companyId: string) => {
    setCompanyId(companyId);
    router.replace("/dashboard");
  };

  return (
    <Card
      className={`border border-black ${companyProfilePageBg}`}
      {...{ [companyProfileChromeRoot]: "" }}
    >
      <CardHeader className={companyProfilePageBg}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Company Profile</span>
              {selectedCompanyName ? (
                <>
                  <span className="text-muted-foreground font-normal tracking-tight" aria-hidden>
                    ----&gt;
                  </span>
                  <span className="text-base sm:text-lg font-semibold" title={selectedCompanyName}>
                    {selectedCompanyName}
                  </span>
                </>
              ) : null}
            </CardTitle>
            <CardDescription>
              {readOnly
                ? "View company profile (read-only). Force upload can still push local data to the server."
                : "Manage your company profile or create a new one."}
            </CardDescription>
          </div>
          <ForceUploadLocalDataButton />
        </div>
        {readOnly ? (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50/90 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2">
            You can view this page but cannot edit company settings.
          </p>
        ) : null}
      </CardHeader>
      {readOnly ? (
        <div className={`w-full px-6 pb-6 pt-0`}>
          <div className={`mt-3 p-4 ${companyProfileGreenZone}`}>
            <EditCompanyForm readOnly />
          </div>
        </div>
      ) : (
      <Tabs defaultValue="edit_company" className="w-full px-6 pb-6 pt-0">
        <TabsList className={companyProfileTabsList}>
          <TabsTrigger value="edit_company" className={companyProfileTabsTrigger}>
            Edit Current Company
          </TabsTrigger>
          <TabsTrigger value="add_company" className={companyProfileTabsTrigger}>
            Add New Company
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit_company" className={`mt-3 p-4 ${companyProfileGreenZone}`}>
          <div className="space-y-4">
            <UploadCompanyToCloudCard />
            <EditCompanyForm />
          </div>
        </TabsContent>
        <TabsContent value="add_company" className={`mt-3 p-4 ${companyProfileGreenZone}`}>
          <CreateCompanyForm onCompanyCreated={handleCompanyCreated} />
        </TabsContent>
      </Tabs>
      )}
    </Card>
  );
}
