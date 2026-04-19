
"use client";

import { useState } from "react";
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
import { UploadCompanyToCloudCard } from "@/components/company/UploadCompanyToCloudCard";

export function CompanySettings() {
  const { setCompanyId } = useCompany();
  const router = useRouter();

  const handleCompanyCreated = (companyId: string) => {
    setCompanyId(companyId);
    router.push("/dashboard");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Profile</CardTitle>
        <CardDescription>
          Manage your company profile or create a new one.
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-4 space-y-4">
        <UploadCompanyToCloudCard />
      </div>
      <Tabs defaultValue="edit_company" className="w-full p-6 pt-0">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="edit_company">Edit Current Company</TabsTrigger>
          <TabsTrigger value="add_company">Add New Company</TabsTrigger>
        </TabsList>
        <TabsContent value="edit_company">
          <EditCompanyForm />
        </TabsContent>
        <TabsContent value="add_company">
          <CreateCompanyForm onCompanyCreated={handleCompanyCreated} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
