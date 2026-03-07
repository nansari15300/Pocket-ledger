"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Keep link-help content grouped by language and section so every voucher can reuse one consistent "Read me" guide.
const LINK_SECTION_INFO = {
  en: {
    title: "Read me – Link section",
    general: [
      "Linking connects related vouchers, so you can clearly track where money came from and where it was used.",
      "Use the Link buttons in this section to attach payment vouchers with bills or with other spend-wise entries.",
      "When you link bill wise, the party page will show bill wise status — Unpaid, Paid, Partial, Over due, etc.",
      "When you link spend wise, on the bank/cash page in spend wise view you can track transactions.",
      "E.g. where the amount from one Payment In (Voucher No. 001) was spent.",
      "When links are correct, your pending balance, settled status and follow-up report stay accurate.",
    ],
    billWise: [
      "Bill wise is used to settle sales and purchase bills against Payment In or Payment Out vouchers.",
      "Tap \"Link to Txns\" to select exact bills manually, or use \"Auto Link\" for quick suggestions (oldest 1st).",
      "Always check Total linked and Balance. If balance is zero, that bill-side payment is fully settled.",
    ],
    spendWise: [
      "Spend wise is used to map one inflow to one or more outflows, so fund usage is visible voucher by voucher.",
      "In this layout, \"From Voucher\" usually shows source inflow and \"To Voucher\" shows where that money got used.",
      "Try to keep linked amount equal to voucher amount, so status becomes \"Settled\" and no hidden balance remains.",
    ],
    contra: [
      "1. What is a Contra voucher? Contra is the voucher in which you transfer money between your own two accounts. No customer or supplier is involved. E.g.: Bank → Cash or Cash → Bank (example: Voucher No. 001). So money only moves from one account to another.",
      "To track which voucher of the account from which money went was used to give this, the \"Other voucher in To Contra out (account Name)\" section above is provided.",
      "2. Meaning of \"Contra in to other out\" — Contra in = money that came into an account via Contra (as above). Other out = any payment or expense from that same account (e.g. expense from Voucher No. 001). There is only one voucher but two types of links, so Contra shows 2 sections. When money that came via Contra (Voucher No. 1) is linked with the expense from that same account, it is called \"Contra in to other out\". For this, the section below is there.",
      "— Flow: Bank → Cash (Contra) → expense from that Cash (Payment Out) | Link: Contra in ↔ Other out.",
    ],
  },
  hi: {
    title: "Read me – Link section",
    general: [
      "Linking से संबंधित vouchers आपस में जुड़ते हैं, ताकि पैसा कहां से आया और कहां इस्तेमाल हुआ साफ दिखे।",
      "इस section के Link buttons से आप payment vouchers को bills या spend wise entries से जोड़ सकते हैं।",
      "जब bill wise में link होगा तो party page पर bill wise में status दिखेगा — Unpaid, Paid, Partial, Over due, आदि।",
      "जब spend wise में link होगा तो bank/cash page पर spend wise view में transaction track किया जा सकेगा।",
      "जैसे एक Payment In (Voucher No. 001) का amount कहाँ-कहाँ खर्च हुआ।",
      "सही linking रहने पर pending balance, settled status और follow-up report सभी सही आते हैं।",
    ],
    billWise: [
      "Bill wise का उपयोग Sales/Purchase bills को Payment In या Payment Out से settle करने के लिए होता है।",
      "\"Link to Txns\" से आप manually सही bills चुन सकते हैं, और \"Auto Link\" से system suggest करता है (oldest 1st)।",
      "Total linked और Balance जरूर देखें। Balance zero मतलब bill-side payment पूरी तरह settled है।",
    ],
    spendWise: [
      "Spend wise में एक inflow को एक या कई outflow से जोड़ा जाता है, ताकि fund flow पूरी तरह trace हो सके।",
      "\"From Voucher\" में source inflow दिखता है और \"To Voucher\" में current usage side दिखती है।",
      "Linked amount को voucher amount के बराबर रखें, तब status \"Settled\" रहेगा और hidden balance नहीं बचेगा।",
    ],
    contra: [
      "1. Contra voucher क्या होता है? Contra वह voucher होता है जिसमें आप पैसा अपने ही दो accounts के बीच transfer करते हैं। इसमें बाहर कोई ग्राहक या सप्लायर शामिल नहीं होता। जैसे: Bank → Cash या Cash → Bank (उदाहरण: Voucher No. 001)। यानी पैसा सिर्फ एक account से दूसरे account में जाता है।",
      "जिस account से पैसा जाता है, उस account का कौन सा voucher से दिया — यह track करने के लिए ऊपर वाला \"Other voucher in To Contra out (account Name)\" section बनाया गया है।",
      "2. \"Contra in to other out\" का मतलब — Contra in = Contra से किसी account में आया हुआ पैसा (जैसे ऊपर बताया)। Other out = उसी account से किया गया कोई payment या खर्च (जैसे Voucher No. 001 से खर्च)। Voucher एक ही है लेकिन link दो तरह के होते हैं, इसलिए Contra में 2 section दिखते हैं। जब Contra से आए पैसे (Voucher No. 1) को उसी account से हुए खर्च के साथ link किया जाता है, उसे \"Contra in to other out\" कहते हैं। इसके लिए नीचे का section है।",
      "— Flow: Bank → Cash (Contra) → उसी Cash से खर्च (Payment Out) | Link: Contra in ↔ Other out।",
    ],
  },
  ne: {
    title: "Read me – Link section",
    general: [
      "Linking गर्दा सम्बन्धित vouchers आपसमा जोडिन्छन्, जसले पैसा कहाँबाट आयो र कहाँ प्रयोग भयो भन्ने स्पष्ट बनाउँछ।",
      "यो section का Link buttons प्रयोग गरेर payment vouchers लाई bills वा spend wise entries सँग जोड्न सकिन्छ।",
      "Bill wise link भएमा party page मा bill wise को status देखिन्छ — Unpaid, Paid, Partial, Over due, आदि।",
      "Spend wise link भएमा bank/cash page को spend wise view मा transaction track गर्न सकिन्छ।",
      "जस्तै एक Payment In (Voucher No. 001) को amount कहाँ-कहाँ खर्च भयो।",
      "सही linking भएपछि pending balance, settled status र follow-up report सबै भरपर्दो हुन्छन्।",
    ],
    billWise: [
      "Bill wise ले Sales/Purchase bills लाई Payment In वा Payment Out सँग settle गर्न सहयोग गर्छ।",
      "\"Link to Txns\" बाट तपाईंले bills manually छान्न सक्नुहुन्छ, र \"Auto Link\" ले छिटो सुझाव दिन्छ (oldest 1st)।",
      "Total linked र Balance अनिवार्य जाँच गर्नुहोस्। Balance zero भए bill-side payment पूर्ण settle भएको हो।",
    ],
    spendWise: [
      "Spend wise मा एउटा inflow लाई एक वा धेरै outflow सँग जोडेर fund flow लाई स्पष्ट रूपमा track गरिन्छ।",
      "\"From Voucher\" मा source inflow देखिन्छ र \"To Voucher\" मा रकम प्रयोग भएको current side देखिन्छ।",
      "Linked amount लाई voucher amount बराबर राख्नुहोस्, त्यसपछि status \"Settled\" देखिन्छ।",
    ],
    contra: [
      "1. Contra voucher के हो? Contra त्यो voucher हो जसमा तपाईंले आफ्नै दुई accounts बीच पैसा स्थानान्तरण गर्नुहुन्छ। बाहिर कोही ग्राहक वा सप्लायर समावेश छैन। जस्तै: Bank → Cash वा Cash → Bank (उदाहरण: Voucher No. 001)। यानी पैसा एक account बाट अर्को account मा मात्र जान्छ।",
      "जुन account बाट पैसा जान्छ, त्यो account को कुन voucher बाट दियो — त्यो track गर्न माथि \"Other voucher in To Contra out (account Name)\" section दिइएको छ।",
      "2. \"Contra in to other out\" को अर्थ — Contra in = Contra बाट कुनै account मा आएको पैसा (माथि जस्तै)। Other out = त्यही account बाट गरिएको कुनै पनि payment वा खर्च (जस्तै Voucher No. 001 बाट खर्च)। Voucher एक हो तर link दुई प्रकारका हुन्छन्, त्यसैले Contra मा 2 section देखिन्छ। जब Contra बाट आएको पैसा (Voucher No. 1) लाई त्यही account बाट भएको खर्च सँग link गरिन्छ, त्यसलाई \"Contra in to other out\" भनिन्छ। यसको लागि तलको section छ।",
      "— Flow: Bank → Cash (Contra) → त्यही Cash बाट खर्च (Payment Out) | Link: Contra in ↔ Other out।",
    ],
  },
} as const;

// PC: max 12 inch width; mobile: near full width with safe padding, scrollable, touch-friendly.
const dialogContentClass =
  "w-[calc(100vw-1.5rem)] max-w-[12in] max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto p-3 sm:p-6 rounded-lg";

/** Single box for one section (General / Bill wise / Spend wise / Contra); title + paragraphs inside, 30px gap between boxes. */
function SectionBox({
  title,
  paragraphs,
  className,
}: {
  title: string;
  paragraphs: readonly string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 px-3 py-2.5 min-w-0 break-words",
        className
      )}
    >
      <h4 className="text-base font-bold text-foreground mb-2">{title}</h4>
      <div className="space-y-2">
        {paragraphs.map((p) => {
          // Tree/flow style: paragraphs with arrow or "Step" get a distinct box so flow is easy to follow.
          const isFlow = /→|Step \d/i.test(p);
          return (
            <p
              key={p}
              className={cn(
                "text-base font-medium text-foreground leading-relaxed break-words",
                isFlow && "font-mono text-sm font-medium pl-2 py-1.5 rounded border-l-2 border-muted-foreground/30 bg-muted/20"
              )}
            >
              {p}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function LinkSectionInfoDialog({
  open,
  onOpenChange,
  className,
  showTrigger = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** When true, render the Read me + Info trigger button (e.g. when not controlled). */
  showTrigger?: boolean;
}) {
  const isControlled = open !== undefined && onOpenChange !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"en" | "hi" | "ne">("en");

  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  React.useEffect(() => {
    if (isOpen) setTab("en");
  }, [isOpen]);

  // Exactly 4 boxes: General, Bill wise, Payment In/Direct Income → Payment Out/Direct Exp, Contra (special) contra to Contra & contra to other; 30px gap.
  const renderLanguageContent = (lang: "en" | "hi" | "ne") => (
    <div className="flex flex-col gap-[30px]">
      <SectionBox title="General" paragraphs={LINK_SECTION_INFO[lang].general} />
      <SectionBox title="Bill wise" paragraphs={LINK_SECTION_INFO[lang].billWise} />
      <SectionBox title="Spend wise: Payment In / Direct Income → Payment Out / Direct Expense" paragraphs={LINK_SECTION_INFO[lang].spendWise} />
      <SectionBox title="Contra  (special) contra to Contra & contra to other " paragraphs={LINK_SECTION_INFO[lang].contra} />
    </div>
  );

  const content = (
    <DialogContent className={cn(dialogContentClass, className)}>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">{LINK_SECTION_INFO[tab].title}</DialogTitle>
      </DialogHeader>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "en" | "hi" | "ne")} className="w-full min-w-0">
        <TabsList className="grid w-full grid-cols-3 h-10 sm:h-9 min-w-0">
          <TabsTrigger value="en" className="text-xs sm:text-sm py-2 min-h-[44px] sm:min-h-0">English</TabsTrigger>
          <TabsTrigger value="hi" className="text-xs sm:text-sm py-2 min-h-[44px] sm:min-h-0">हिंदी</TabsTrigger>
          <TabsTrigger value="ne" className="text-xs sm:text-sm py-2 min-h-[44px] sm:min-h-0">नेपाली</TabsTrigger>
        </TabsList>
        <TabsContent value="en" className="mt-3 space-y-0">{renderLanguageContent("en")}</TabsContent>
        <TabsContent value="hi" className="mt-3 space-y-0">{renderLanguageContent("hi")}</TabsContent>
        <TabsContent value="ne" className="mt-3 space-y-0">{renderLanguageContent("ne")}</TabsContent>
      </Tabs>
    </DialogContent>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && !isControlled && (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Link section information"
          >
            <Info className="h-4 w-4 shrink-0" />
            Read me
          </Button>
        </DialogTrigger>
      )}
      {content}
    </Dialog>
  );
}
