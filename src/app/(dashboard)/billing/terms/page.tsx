"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BILLING_TERMS_BY_LOCALE, type TermsLocale } from "@/legal/billingTermsLocales";

/** Renders one locale’s sections — shared by each tab to avoid duplicating layout. */
function TermsBody({ locale }: { locale: TermsLocale }) {
  const doc = BILLING_TERMS_BY_LOCALE[locale];
  return (
    <div className="space-y-8 text-sm leading-relaxed">
      <header className="space-y-1 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{doc.documentTitle}</h1>
        <p className="text-muted-foreground">
          {doc.lastUpdatedLabel}: {doc.lastUpdatedISO}
        </p>
      </header>
      {doc.sections.map((sec, i) => (
        <section key={`${locale}-${i}`} className="space-y-3 scroll-mt-4">
          <h2 className="text-base font-semibold text-foreground">{sec.h}</h2>
          {sec.p.map((para, j) => (
            <p key={j} className="text-muted-foreground whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Full billing / SaaS terms (multi-page prose) — opens from Billing footer; EN / NE / HI tabs.
 * New tab/window link from parent so users keep the billing table context if they prefer.
 */
export default function BillingTermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-16 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-6 gap-1" asChild>
        <Link href="/billing">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to billing
        </Link>
      </Button>

      <Tabs defaultValue="en" className="w-full">
        {/* Sticky tab bar: long document scroll ke dauran bhi locale switch accessible. */}
        <TabsList className="mb-8 grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="en">English</TabsTrigger>
          <TabsTrigger value="ne">नेपाली</TabsTrigger>
          <TabsTrigger value="hi">हिंदी</TabsTrigger>
        </TabsList>
        <TabsContent value="en" className="mt-0 outline-none">
          <TermsBody locale="en" />
        </TabsContent>
        <TabsContent value="ne" className="mt-0 outline-none">
          <TermsBody locale="ne" />
        </TabsContent>
        <TabsContent value="hi" className="mt-0 outline-none">
          <TermsBody locale="hi" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
