
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CreateCompanyForm } from "@/components/company/CreateCompanyForm";
import { EditCompanyForm } from "@/components/company/EditCompanyForm";
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

export function CompanySettings() {
  const { company, setCompanyId } = useCompany();
  const router = useRouter();
  // Title ke bagal: ----> + selected company naam (sidebar switch par update)
  const selectedCompanyName = String(company?.name || "").trim();

  const handleCompanyCreated = (companyId: string) => {
    setCompanyId(companyId);
    router.push("/dashboard");
  };

  return (
    <Card
      className={`border border-black ${companyProfilePageBg}`}
      {...{ [companyProfileChromeRoot]: "" }}
    >
      <CardHeader className={companyProfilePageBg}>
        <div>
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
            Manage your company profile or create a new one.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="px-6 pb-4 space-y-4">
      </div>
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
          <EditCompanyForm />
        </TabsContent>
        <TabsContent value="add_company" className={`mt-3 p-4 ${companyProfileGreenZone}`}>
          <CreateCompanyForm onCompanyCreated={handleCompanyCreated} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
