export type BalanceSheetDiffTraceLang = "en" | "hi" | "ne";

export const BALANCE_SHEET_DIFF_TRACE_LANGS: Array<{
  value: BalanceSheetDiffTraceLang;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "ne", label: "नेपाली" },
];

export const BALANCE_SHEET_DIFF_TRACE_INTRO: Record<BalanceSheetDiffTraceLang, string> = {
  en: "Side-conflict accounts appear first; other active accounts follow as individual rows (subtle background). Opening Total matches the company master opening audit.",
  hi: "पक्ष-विरोध वाले खाते पहले; अन्य सक्रिय खाते नीचे एक-एक पंक्ति में (हल्का background)। Opening Total कंपनी master opening audit से मेल खाता है।",
  ne: "पक्ष-विरोध भएका खाताहरू पहिले; अन्य सक्रिय खाताहरू तल एक-एक पङ्क्तिमा (हल्का background)। Opening Total कम्पनी master opening audit सँग मिल्छ।",
};

export const BALANCE_SHEET_DIFF_TRACE_FORMULA: Record<BalanceSheetDiffTraceLang, string> = {
  en: "Final balance = Opening balance + Current movement",
  hi: "अंतिम शेष = प्रारंभिक शेष + वर्तमान गति",
  ne: "अन्तिम मौज्दात = सुरुवाती मौज्दात + हालको चाल",
};

export function balanceSheetDiffTraceAccountNoLabel(count: number): string {
  return `No. ${count}`;
}

/** Column header — total accounts in this trace view, e.g. Account 99. */
export function balanceSheetDiffTraceAccountCountHeaderLabel(count: number): string {
  return `Account ${Math.max(0, count)}`;
}

/** Visible row label in Difference Trace identity column — e.g. Account 01. */
export function balanceSheetDiffTraceAccountDisplayLabel(displayNo: number): string {
  return `Account ${String(Math.max(1, displayNo)).padStart(2, "0")}`;
}

export function balanceSheetDiffTraceOthersAccountsTitleWithCount(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  const noLabel = balanceSheetDiffTraceAccountNoLabel(count);
  switch (lang) {
    case "en":
      return `Others accounts · ${noLabel}`;
    case "hi":
      return `अन्य खाते · ${noLabel}`;
    case "ne":
      return `अन्य खाताहरू · ${noLabel}`;
  }
}

export function balanceSheetDiffTraceOthersAccountsIntroLines(
  count: number,
  lang: BalanceSheetDiffTraceLang
): string[] {
  const noLabel = balanceSheetDiffTraceAccountNoLabel(count);
  switch (lang) {
    case "en":
      return [
        `${noLabel} other accounts are listed below the side-conflict rows (subtle background). They have no customer/supplier side conflict and no opening-balance direction change.`,
        "Each row shows that account's own Opening, Closing Balance, and Movement Dr / Cr / Difference — not a combined group total.",
        "The Total footer sums every row above (conflict accounts + other accounts). Opening Total matches the company master opening audit.",
      ];
    case "hi":
      return [
        `${noLabel} अन्य खाते पक्ष-विरोध वाली पंक्तियों के नीचे (हल्का background) सूचीबद्ध हैं — इनमें customer/supplier पक्ष-विरोध या opening-balance दिशा परिवर्तन नहीं मिला।`,
        "हर पंक्ति उस खाते का अपना Opening, Closing Balance और Movement Dr / Cr / Difference दिखाती है — समूह योग नहीं।",
        "Total footer ऊपर की सभी पंक्तियों (conflict + other) का योग है। Opening Total कंपनी master opening audit से मेल खाता है।",
      ];
    case "ne":
      return [
        `${noLabel} अन्य खाताहरू पक्ष-विरोध भएका पङ्क्तिहरू तल (हल्का background) सूचीबद्ध छन् — यिनमा customer/supplier पक्ष-विरोध वा opening-balance दिशा परिवर्तन छैन।`,
        "प्रत्येक पङ्क्तिले त्यो खाताको आफ्नै Opening, Closing Balance र Movement Dr / Cr / Difference देखाउँछ — समूह जम्मा होइन।",
        "Total footer माथिका सबै पङ्क्तिहरू (conflict + other) को जम्मा हो। Opening Total कम्पनी master opening audit सँग मिल्छ।",
      ];
  }
}

export function balanceSheetDiffTraceSectionCountsLine(
  conflictCount: number,
  otherCount: number,
  lang: BalanceSheetDiffTraceLang
): string {
  const conflictNo = balanceSheetDiffTraceAccountNoLabel(conflictCount);
  const otherNo = balanceSheetDiffTraceAccountNoLabel(otherCount);
  switch (lang) {
    case "en":
      return `Side-conflict accounts ${conflictNo} · Other accounts ${otherNo}`;
    case "hi":
      return `पक्ष-विरोध खाते ${conflictNo} · अन्य खाते ${otherNo}`;
    case "ne":
      return `पक्ष-विरोध खाताहरू ${conflictNo} · अन्य खाताहरू ${otherNo}`;
  }
}

export type BalanceSheetDiffTraceFilter = "all" | "conflict" | "other" | "noOpening";

export function balanceSheetDiffTraceFilterTabAll(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (lang) {
    case "en":
      return `All ${count}`;
    case "hi":
      return `सभी ${count}`;
    case "ne":
      return `सबै ${count}`;
  }
}

/** Opening trace — first tab (master opening audit list). */
export function balanceSheetDiffTraceFilterTabOpeningDifference(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (lang) {
    case "en":
      return `Opening difference ${count}`;
    case "hi":
      return `Opening difference ${count}`;
    case "ne":
      return `Opening difference ${count}`;
  }
}

export function balanceSheetDiffTraceFilterTabSideConflict(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (lang) {
    case "en":
      return `Side Changed ${count}`;
    case "hi":
      return `Side Changed ${count}`;
    case "ne":
      return `Side Changed ${count}`;
  }
}

export function balanceSheetDiffTraceFilterTabOther(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (lang) {
    case "en":
      return `Side Not changed ${count}`;
    case "hi":
      return `Side Not changed ${count}`;
    case "ne":
      return `Side Not changed ${count}`;
  }
}

export function balanceSheetDiffTraceFilterTabWithoutOpening(
  count: number,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (lang) {
    case "en":
      return `Without opening ${count}`;
    case "hi":
      return `Opening के बिना ${count}`;
    case "ne":
      return `Opening बिना ${count}`;
  }
}

export type BalanceSheetDiffTraceFilterTabId = BalanceSheetDiffTraceFilter;

export function balanceSheetDiffTraceFilterTabIntroTitle(
  tabId: BalanceSheetDiffTraceFilterTabId,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (tabId) {
    case "all":
      switch (lang) {
        case "en":
          return "All accounts — this tab";
        case "hi":
          return "सभी खाते — यह टैब";
        case "ne":
          return "सबै खाता — यो tab";
      }
      break;
    case "conflict":
      switch (lang) {
        case "en":
          return "Side Changed — this tab";
        case "hi":
          return "Side Changed — यह टैब";
        case "ne":
          return "Side Changed — यो tab";
      }
      break;
    case "other":
      switch (lang) {
        case "en":
          return "Side Not changed — this tab";
        case "hi":
          return "Side Not changed — यह टैब";
        case "ne":
          return "Side Not changed — यो tab";
      }
      break;
    case "noOpening":
      switch (lang) {
        case "en":
          return "Without opening — this tab";
        case "hi":
          return "प्रारंभिक शेष के बिना — यह टैब";
        case "ne":
          return "Opening बिना — यो tab";
      }
      break;
  }
}

export function balanceSheetDiffTraceFilterTabIntroLines(
  tabId: BalanceSheetDiffTraceFilterTabId,
  lang: BalanceSheetDiffTraceLang = "en"
): string[] {
  switch (tabId) {
    case "all":
      switch (lang) {
        case "en":
          return [
            "Lists every account from the three tabs below (unique rows — no duplicate count).",
            "Includes accounts that have opening balance and the debit/credit side changed — e.g. opening was Dr but closing is Cr (or the reverse).",
            "Also includes accounts where period movement does not tie on its own: if you ignore opening and look only at transactions, closing still shows a balance (movement Dr/Cr are not equal).",
            "Not listed here: accounts with no opening balance entered and period transactions net to zero closing (fully balanced with zero closing).",
          ];
        case "hi":
          return [
            "नीचे के तीन टैब के सभी अलग-अलग खाते (दोहरी गिनती नहीं)।",
            "प्रारंभिक शेष वाले खाते जहाँ डेबिट/क्रेडिट पक्ष बदल गया — जैसे प्रारंभ में डेबिट था लेकिन अंतिम शेष क्रेडिट हो गया।",
            "वे खाते भी जहाँ अवधि की चाल अकेले मेल नहीं खाती: प्रारंभिक शेष छोड़कर सिर्फ लेन-देन देखें तो भी अंतिम शेष दिखता है (चाल का डेबिट/क्रेडिट बराबर नहीं)।",
            "यहाँ नहीं: जिनमें प्रारंभिक शेष नहीं है और लेन-देन संतुलित होकर अंतिम शेष शून्य है।",
          ];
        case "ne":
          return [
            "तलका तीन tabs का सबै unique खाता (दोहोरो गिन्ती होइन)।",
            "Opening balance भएका खाता जहाँ Dr/Cr side परिवर्तन भयो — opening Dr थियो, closing Cr भयो जस्तै।",
            "Movement मात्रले मिल्दैन जहाँ: opening नहेरी transaction मात्र हेर्दा पनि closing balance देखिन्छ।",
            "यहाँ छैन: opening छैन र transaction मिलेर closing शून्य भएका खाता।",
          ];
      }
      break;
    case "conflict":
      switch (lang) {
        case "en":
          return [
            "Accounts where master opening Dr/Cr side is opposite to closing Dr/Cr side.",
            "Example: opening Dr but closing Cr — or opening Cr but closing Dr.",
            "Both opening and closing must be non-zero; same side (Dr/Dr or Cr/Cr) is not Side Changed.",
          ];
        case "hi":
          return [
            "Master opening Dr/Cr aur closing Dr/Cr **opposite** side par — yahi Side Changed tab hai.",
            "Example: opening Dr, closing Cr — ya opening Cr, closing Dr.",
            "Opening aur closing dono non-zero; same side (Dr/Dr ya Cr/Cr) yahan nahi aata.",
          ];
        case "ne":
          return [
            "Master opening Dr/Cr ra closing Dr/Cr **opposite** side ma — Side Changed tab.",
            "Example: opening Dr, closing Cr — wa opening Cr, closing Dr.",
            "Opening ra closing दुवै non-zero; same side (Dr/Dr wa Cr/Cr) yaha chaina.",
          ];
      }
      break;
    case "other":
      switch (lang) {
        case "en":
          return [
            "Accounts with master opening balance and period closing or movement activity.",
            "Opening Dr/Cr side is the same as closing Dr/Cr side — not Side Changed.",
            "Use this tab for active masters that kept the same debit/credit side from opening to closing.",
          ];
        case "hi":
          return [
            "Master opening balance hai aur period mein closing/movement hai.",
            "Opening Dr/Cr aur closing Dr/Cr **same** side par — Side Changed nahi.",
            "Opening se closing tak same debit/credit side wale active masters.",
          ];
        case "ne":
          return [
            "Master opening balance छ र period मा closing/movement छ।",
            "Opening Dr/Cr र closing Dr/Cr **same** side ma — Side Changed होइन।",
            "Opening देखि closing सम्म same debit/credit side भएका active masters।",
          ];
      }
      break;
    case "noOpening":
      switch (lang) {
        case "en":
          return [
            "Accounts whose master opening balance is zero or not entered (excluding side-conflicted rows).",
            "No opening entered, but closing balance and/or period movement exists — from transactions only.",
            "Movement difference shows here: closing Dr/Cr remains even though opening is zero.",
          ];
        case "hi":
          return [
            "Master opening zero है या दर्ज नहीं (Side Conflicted rows छोड़कर)।",
            "Opening नहीं है, लेकिन closing balance और/या period movement है — सिर्फ transactions से।",
            "Movement difference भी दिखता है: opening zero होने पर भी closing Dr/Cr बचा हुआ है।",
          ];
        case "ne":
          return [
            "Master opening शून्य वा राखिएको छैन (side-conflicted rows बाहेक)।",
            "Opening छैन, तर closing balance वा period movement छ — transaction मात्रबाट।",
            "Movement difference पनि देखिन्छ: opening शून्य भए पनि closing Dr/Cr बाँकी छ।",
          ];
      }
      break;
  }
  return [];
}

export type BalanceSheetDiffTraceOpeningTraceFilter = Exclude<BalanceSheetDiffTraceFilter, "noOpening">;

export function balanceSheetDiffTraceOpeningTraceFilterTabIntroTitle(
  tabId: BalanceSheetDiffTraceOpeningTraceFilter,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  if (tabId === "all") {
    switch (lang) {
      case "en":
        return "Opening difference — this tab";
      case "hi":
        return "Opening difference — यह टैब";
      case "ne":
        return "Opening difference — यो tab";
    }
  }
  return balanceSheetDiffTraceFilterTabIntroTitle(tabId, lang);
}

export function balanceSheetDiffTraceOpeningTraceFilterTabIntroLines(
  tabId: BalanceSheetDiffTraceOpeningTraceFilter,
  lang: BalanceSheetDiffTraceLang = "en"
): string[] {
  if (tabId === "all") {
    switch (lang) {
      case "en":
        return [
          "Every master account with a non-zero opening balance (party, bank, staff, tax, income/expense).",
          "Opening Dr / Cr totals and footer Difference match the Opening Balance Mismatch card on the Balance Sheet.",
          "Side Changed and Side Not changed tabs split these accounts by whether opening and closing Dr/Cr side differs.",
        ];
      case "hi":
        return [
          "हर master account jiska non-zero opening balance hai (party, bank, staff, tax, income/expense).",
          "Opening Dr / Cr totals aur footer Difference Balance Sheet par Opening Balance Mismatch card se match karte hain.",
          "Side Changed aur Side Not changed tabs in accounts ko opening/closing Dr/Cr side ke hisaab se batate hain.",
        ];
      case "ne":
        return [
          "Non-zero opening balance भएका सबै master accounts (party, bank, staff, tax, income/expense).",
          "Opening Dr / Cr totals र footer Difference Balance Sheet को Opening Balance Mismatch card सँग मिल्छ।",
          "Side Changed र Side Not changed tabs le opening/closing Dr/Cr side अनुसार accounts छुट्याउँछ।",
        ];
    }
  }
  return balanceSheetDiffTraceFilterTabIntroLines(tabId, lang);
}

export type BalanceSheetDiffTraceCategoryFilter = Exclude<BalanceSheetDiffTraceFilter, "all">;

export function balanceSheetDiffTraceFooterCategoryTotalLabel(
  category: BalanceSheetDiffTraceCategoryFilter,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (category) {
    case "conflict":
      switch (lang) {
        case "en":
          return "Side Changed Total";
        case "hi":
          return "Side Changed Total";
        case "ne":
          return "Side Changed Total";
      }
      break;
    case "other":
      switch (lang) {
        case "en":
          return "Side Not changed Total";
        case "hi":
          return "Side Not changed Total";
        case "ne":
          return "Side Not changed Total";
      }
      break;
    case "noOpening":
      switch (lang) {
        case "en":
          return "Without opening Total";
        case "hi":
          return "Without opening Total";
        case "ne":
          return "Without opening Total";
      }
      break;
  }
}

export const BALANCE_SHEET_DIFF_TRACE_OTHERS_ACCOUNTS_INTRO: Record<BalanceSheetDiffTraceLang, string[]> = {
  en: [
    "Accounts listed below the side-conflict rows, with a subtle background, have no customer/supplier side conflict and no opening-balance direction change.",
    "Each row shows that account's own Opening, Closing Balance, and Movement Dr / Cr / Difference — not a combined group total.",
    "The Total footer sums every row above (conflict accounts + other accounts). Opening Total matches the company master opening audit.",
  ],
  hi: [
    "पक्ष-विरोध वाली पंक्तियों के नीचे हल्के background वाली पंक्तियाँ अन्य खाते हैं — इनमें customer/supplier पक्ष-विरोध या opening-balance दिशा परिवर्तन नहीं मिला।",
    "हर पंक्ति उस खाते का अपना Opening, Closing Balance और Movement Dr / Cr / Difference दिखाती है — समूह योग नहीं।",
    "Total footer ऊपर की सभी पंक्तियों (conflict + other) का योग है। Opening Total कंपनी master opening audit से मेल खाता है।",
  ],
  ne: [
    "पक्ष-विरोध भएका पङ्क्तिहरू तल हल्का background भएका पङ्क्तिहरू अन्य खाताहरू हुन् — यिनमा customer/supplier पक्ष-विरोध वा opening-balance दिशा परिवर्तन छैन।",
    "प्रत्येक पङ्क्तिले त्यो खाताको आफ्नै Opening, Closing Balance र Movement Dr / Cr / Difference देखाउँछ — समूह जम्मा होइन।",
    "Total footer माथिका सबै पङ्क्तिहरू (conflict + other) को जम्मा हो। Opening Total कम्पनी master opening audit सँग मिल्छ।",
  ],
};

/** @deprecated Use BALANCE_SHEET_DIFF_TRACE_OTHERS_ACCOUNTS_INTRO */
export const BALANCE_SHEET_DIFF_TRACE_OTHERS_OPENING_INTRO: Record<BalanceSheetDiffTraceLang, string> = {
  en: BALANCE_SHEET_DIFF_TRACE_OTHERS_ACCOUNTS_INTRO.en[0],
  hi: BALANCE_SHEET_DIFF_TRACE_OTHERS_ACCOUNTS_INTRO.hi[0],
  ne: BALANCE_SHEET_DIFF_TRACE_OTHERS_ACCOUNTS_INTRO.ne[0],
};

export type BalanceSheetDiffTraceCardId = "account" | "opening" | "closing" | "movement" | "difference";

export function balanceSheetDiffTraceCardTitle(
  card: BalanceSheetDiffTraceCardId,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  switch (card) {
    case "account":
      switch (lang) {
        case "en":
          return "Account & Group";
        case "hi":
          return "खाता और समूह";
        case "ne":
          return "खाता र समूह";
      }
      break;
    case "opening":
      switch (lang) {
        case "en":
          return "Opening balance";
        case "hi":
          return "प्रारंभिक शेष";
        case "ne":
          return "सुरुवाती मौज्दात";
      }
      break;
    case "closing":
      switch (lang) {
        case "en":
          return "Closing balance";
        case "hi":
          return "समापन शेष";
        case "ne":
          return "समापन मौज्दात";
      }
      break;
    case "movement":
      switch (lang) {
        case "en":
          return "Movement";
        case "hi":
          return "गति (Movement)";
        case "ne":
          return "चाल (Movement)";
      }
      break;
    case "difference":
      switch (lang) {
        case "en":
          return "Difference";
        case "hi":
          return "Difference";
        case "ne":
          return "Difference";
      }
      break;
  }
}

export function balanceSheetDiffTraceCardIntro(
  card: BalanceSheetDiffTraceCardId,
  lang: BalanceSheetDiffTraceLang
): string[] {
  switch (card) {
    case "account":
      switch (lang) {
        case "en":
          return [
            "Lists each account included in this Difference Trace because a side conflict or opening-balance direction change was found.",
            "Account column: master name plus type (Parties, Bank/Cash, Staff, etc.) and chart group.",
            "Group column: balance sheet classification — Assets, Liabilities, or Equity.",
            "Double-click a row to open the same ledger detail as on the main Balance Sheet.",
          ];
        case "hi":
          return [
            "वे सभी खाते जिनमें पक्ष-विरोध या opening-balance दिशा परिवर्तन मिला — इस Difference Trace में सूचीबद्ध हैं।",
            "खाता स्तम्भ: master नाम + प्रकार (Parties, Bank/Cash, Staff, आदि) और chart समूह।",
            "समूह स्तम्भ: बैलेंस शीट वर्गीकरण — Assets, Liabilities, या Equity।",
            "पंक्ति पर डबल-क्लिक करने से मुख्य Balance Sheet जैसा ही ledger detail खुलता है।",
          ];
        case "ne":
          return [
            "पक्ष-विरोध वा opening-balance दिशा परिवर्तन भएका खाताहरू — यो Difference Trace मा सूचीबद्ध छन्।",
            "खाता स्तम्भ: master नाम + प्रकार (Parties, Bank/Cash, Staff, आदि) र chart समूह।",
            "समूह स्तम्भ: ब्यालेन्स शिट वर्गीकरण — Assets, Liabilities, वा Equity।",
            "पङ्क्तिमा डबल-क्लिक गर्दा मुख्य Balance Sheet जस्तै ledger detail खुल्छ।",
          ];
      }
      break;
    case "opening":
      switch (lang) {
        case "en":
          return [
            "Raw master opening balance from party, bank/cash, staff, tax, and income/expense forms — same basis as the Opening Balance Mismatch card on the Balance Sheet page.",
            "System Opening Balance equity ledger is excluded.",
            "Dr / Cr split the amount by natural side; Difference = net opening (Dr − Cr).",
            "Others accounts footer = combined opening for masters not listed above. Total = full master opening audit.",
          ];
        case "hi":
          return [
            "party, bank/cash, staff, tax और income/expense forms का raw master opening — Balance Sheet पेज के Opening Balance Mismatch card जैसा आधार।",
            "System Opening Balance equity ledger शामिल नहीं।",
            "Dr / Cr राशि को पक्ष के अनुसार बाँटते हैं; Difference = शुद्ध opening (Dr − Cr)।",
            "Others accounts footer = ऊपर सूचीबद्ध न खातों का संयुक्त opening। Total = पूरा master opening audit।",
          ];
        case "ne":
          return [
            "party, bank/cash, staff, tax र income/expense forms को raw master opening — Balance Sheet पृष्ठको Opening Balance Mismatch card जस्तै आधार।",
            "System Opening Balance equity ledger समावेश छैन।",
            "Dr / Cr रकम पक्ष अनुसार विभाजन; Difference = net opening (Dr − Cr)।",
            "Others accounts footer = माथि सूचीबद्ध नभएका masters को संयुक्त opening। Total = पूरा master opening audit।",
          ];
      }
      break;
    case "closing":
      switch (lang) {
        case "en":
          return [
            "Closing balance as on the Balance Sheet as-of date for each listed account.",
            "Expected line shows the natural side from ledger class: Asset → Dr, Liability → Cr.",
            "Difference = signed closing balance (Dr − Cr).",
            "Others accounts footer shows closing totals for masters not listed above; Total sums listed trace accounts only.",
          ];
        case "hi":
          return [
            "प्रत्येक सूचीबद्ध खाते का Balance Sheet as-of date पर समापन शेष।",
            "Expected पंक्ति ledger class से प्राकृतिक पक्ष दिखाती है: Asset → Dr, Liability → Cr।",
            "Difference = चिह्नित समापन शेष (Dr − Cr)।",
            "Others accounts footer = ऊपर सूचीबद्ध न खातों का समापन योग; Total = केवल सूचीबद्ध trace खाते।",
          ];
        case "ne":
          return [
            "सूचीबद्ध प्रत्येक खाताको Balance Sheet as-of date मा समापन मौज्दात।",
            "Expected लाइनले ledger class बाट प्राकृतिक पक्ष देखाउँछ: Asset → Dr, Liability → Cr।",
            "Difference = signed closing balance (Dr − Cr)।",
            "Others accounts footer = माथि सूचीबद्ध नभएका masters को समापन जम्मा; Total = सूचीबद्ध trace खाता मात्र।",
          ];
      }
      break;
    case "movement":
      switch (lang) {
        case "en":
          return [
            "Voucher movement from fiscal-year start through the report as-of date.",
            "When company fiscal year is set, opening dated on/after FY start moves into movement instead of the Opening column.",
            "Dr / Cr = total debits and credits in the period.",
            "Final balance = Opening balance + Movement (see formula above the table).",
            "Others accounts footer = movement for masters not listed above; Total = listed trace accounts only.",
          ];
        case "hi":
          return [
            "वित्तीय वर्ष प्रारंभ से रिपोर्ट as-of date तक का voucher movement।",
            "कंपनी वित्तीय वर्ष सेट होने पर FY प्रारंभ के बाद/समान तिथि की opening Opening के बजाय movement में जाती है।",
            "Dr / Cr = अवधि के कुल debit और credit।",
            "अंतिम शेष = प्रारंभिक शेष + गति (तालिका के ऊपर सूत्र देखें)।",
            "Others accounts footer = ऊपर सूचीबद्ध न खातों की गति; Total = केवल सूचीबद्ध trace खाते।",
          ];
        case "ne":
          return [
            "आर्थिक वर्ष सुरु देखि रिपोर्ट as-of date सम्म voucher movement।",
            "कम्पनी आर्थिक वर्ष सेट भएमा FY सुरु पछि/सोही मितिको opening Opening स्तम्भभन्दा movement मा जान्छ।",
            "Dr / Cr = अवधिका कुल debit र credit।",
            "अन्तिम मौज्दात = सुरुवाती मौज्दात + चाल (तालिका माथिको सूत्र हेर्नुहोस्)।",
            "Others accounts footer = माथि सूचीबद्ध नभएका masters को movement; Total = सूचीबद्ध trace खाता मात्र।",
          ];
      }
      break;
    case "difference":
      switch (lang) {
        case "en":
          return [
            "Net movement imbalance for each account: Movement Dr − Movement Cr.",
            "Positive net shows in Dr; negative net shows in Cr.",
            "Difference Dr / Cr = net trxn movement (Movement Dr − Movement Cr) on one side only.",
            "Running Balance = previous balance + Difference Dr − Difference Cr row by row.",
            "Total row sums Dr and Cr columns separately — they should match when movement is balanced across all listed accounts.",
          ];
        case "hi":
          return [
            "प्रत्येक खाते का शुद्ध movement असंतुलन: Movement Dr − Movement Cr।",
            "धनात्मक शुद्ध Dr में; ऋणात्मक शुद्ध Cr में।",
            "Total पंक्ति Dr और Cr स्तम्भों का अलग-अलग योग — सभी सूचीबद्ध खातों में movement संतुलित होने पर वे मेल खाना चाहिए।",
          ];
        case "ne":
          return [
            "प्रत्येक खाताको net movement असन्तुलन: Movement Dr − Movement Cr।",
            "Positive net Dr मा; negative net Cr मा।",
            "Total पङ्क्तिले Dr र Cr स्तम्भ अलग-अलग जोड्छ — सूचीबद्ध सबै खातामा movement सन्तुलित भए मिल्नुपर्छ।",
          ];
      }
      break;
  }
  return [];
}

export function balanceSheetDiffTraceOthersAccountsTitle(lang: BalanceSheetDiffTraceLang): string {
  switch (lang) {
    case "en":
      return "Others accounts";
    case "hi":
      return "अन्य खाते";
    case "ne":
      return "अन्य खाताहरू";
  }
}

/** @deprecated Use balanceSheetDiffTraceOthersAccountsTitle */
export const balanceSheetDiffTraceOthersOpeningTitle = balanceSheetDiffTraceOthersAccountsTitle;

export function balanceSheetDiffTraceOpeningDifferenceIntro(
  lang: BalanceSheetDiffTraceLang
): string[] {
  switch (lang) {
    case "en":
      return [
        "This row matches the Opening Balance Mismatch card on the Balance Sheet page.",
        "It uses raw master opening balances (party, bank, staff, tax, income/expense) only — the system Opening Balance equity ledger is excluded.",
        "Listed accounts + Others accounts = this total.",
      ];
    case "hi":
      return [
        "यह पंक्ति Balance Sheet पेज पर Opening Balance Mismatch card से मेल खाती है।",
        "यह केवल master forms के raw opening balance (party, bank, staff, tax, income/expense) उपयोग करती है — system Opening Balance equity ledger शामिल नहीं।",
        "सूचीबद्ध खाते + Others accounts = यह कुल।",
      ];
    case "ne":
      return [
        "यो पङ्क्ति Balance Sheet पृष्ठको Opening Balance Mismatch card सँग मिल्छ।",
        "यसले master forms को raw opening balance (party, bank, staff, tax, income/expense) मात्र प्रयोग गर्छ — system Opening Balance equity ledger समावेश छैन।",
        "सूचीबद्ध खाताहरू + Others accounts = यो जम्मा।",
      ];
  }
}

export function formatBalanceSheetCompanyFiscalYearRange(
  start: Date | null,
  end: Date | null,
  formatAd: (d: Date) => string,
  formatBs: (d: Date) => string,
  dateSystem: string
): string | null {
  if (!start && !end) return null;
  const fmt = (d: Date) => {
    if (dateSystem === "BS") return formatBs(d);
    if (dateSystem === "Both") return `${formatAd(d)} / ${formatBs(d)}`;
    return formatAd(d);
  };
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return fmt(start);
  return end ? fmt(end) : null;
}

export type BalanceSheetFiscalYearContext = {
  savedStart: Date | null;
  savedEnd: Date | null;
  savedLabel: string | null;
  isSavedSet: boolean;
  /** Earliest voucher or dated master opening — used when FY not set. */
  ledgerEarliestDate: Date | null;
  allRangeLabel: string;
  effectiveStart: Date | undefined;
  effectiveLabel: string;
};

function formatBalanceSheetFiscalDate(
  d: Date,
  formatAd: (d: Date) => string,
  formatBs: (d: Date) => string,
  dateSystem: string
): string {
  if (dateSystem === "BS") return formatBs(d);
  if (dateSystem === "Both") return `${formatAd(d)} / ${formatBs(d)}`;
  return formatAd(d);
}

export function balanceSheetAllRangeFromStartToTodayLabel(
  ledgerEarliestDate: Date | null,
  rangeEnd: Date,
  formatAd: (d: Date) => string,
  formatBs: (d: Date) => string,
  dateSystem: string,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  const endLabel = formatBalanceSheetFiscalDate(rangeEnd, formatAd, formatBs, dateSystem);
  if (!ledgerEarliestDate) {
    switch (lang) {
      case "en":
        return `All · Till ${endLabel}`;
      case "hi":
        return `सभी · ${endLabel} तक`;
      case "ne":
        return `सबै · ${endLabel} सम्म`;
    }
  }
  const startLabel = formatBalanceSheetFiscalDate(
    ledgerEarliestDate,
    formatAd,
    formatBs,
    dateSystem
  );
  switch (lang) {
    case "en":
      return `Start From ${startLabel} Till ${endLabel}`;
    case "hi":
      return `${startLabel} से ${endLabel} तक`;
    case "ne":
      return `${startLabel} देखि ${endLabel} सम्म`;
  }
}

export function buildBalanceSheetFiscalYearContext(
  savedStart: Date | null,
  savedEnd: Date | null,
  formatAd: (d: Date) => string,
  formatBs: (d: Date) => string,
  dateSystem: string,
  ledgerEarliestDate: Date | null,
  asOfDate: Date = new Date()
): BalanceSheetFiscalYearContext {
  const savedLabel = formatBalanceSheetCompanyFiscalYearRange(
    savedStart,
    savedEnd,
    formatAd,
    formatBs,
    dateSystem
  );
  const isSavedSet = Boolean(savedStart || savedEnd);
  const allRangeLabel = balanceSheetAllRangeFromStartToTodayLabel(
    ledgerEarliestDate,
    asOfDate,
    formatAd,
    formatBs,
    dateSystem
  );
  const effectiveStart = savedStart ?? undefined;
  const effectiveLabel = isSavedSet ? savedLabel ?? allRangeLabel : allRangeLabel;
  return {
    savedStart,
    savedEnd,
    savedLabel,
    isSavedSet,
    ledgerEarliestDate,
    allRangeLabel,
    effectiveStart,
    effectiveLabel,
  };
}

export function balanceSheetFiscalYearNotSetLabel(lang: BalanceSheetDiffTraceLang = "en"): string {
  switch (lang) {
    case "en":
      return "Not set";
    case "hi":
      return "सेट नहीं";
    case "ne":
      return "सेट छैन";
  }
}

export function balanceSheetFiscalYearDisplayRangeLabel(
  ctx: BalanceSheetFiscalYearContext,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  if (ctx.isSavedSet) {
    return ctx.savedLabel ?? balanceSheetFiscalYearNotSetLabel(lang);
  }
  return ctx.allRangeLabel;
}

export function balanceSheetMasterOpeningFiscalNote(
  ctx: BalanceSheetFiscalYearContext,
  lang: BalanceSheetDiffTraceLang = "en"
): string {
  if (!ctx.isSavedSet) {
    switch (lang) {
      case "en":
        return `Saved fiscal year is not set. This check uses raw master opening — fiscal split not applied. Range in use: all from start to today (${ctx.allRangeLabel}).`;
      case "hi":
        return `सहेजा वित्तीय वर्ष सेट नहीं है। यह जाँच raw master opening उपयोग करती है — fiscal split नहीं लगता। उपयोग में सीमा: शुरुआत से आज तक (${ctx.allRangeLabel})।`;
      case "ne":
        return `सेभ गरिएको आर्थिक वर्ष सेट छैन। यो जाँच raw master opening प्रयोग गर्छ — fiscal split लाग्दैन। प्रयोगमा सीमा: सुरु देखि आजसम्म (${ctx.allRangeLabel})।`;
    }
  }
  return `Company fiscal year: ${ctx.savedLabel}. This check uses raw master opening — fiscal split not applied.`;
}

export function balanceSheetDiffTraceFiscalNote(
  lang: BalanceSheetDiffTraceLang,
  ctx: BalanceSheetFiscalYearContext
): string {
  if (!ctx.isSavedSet) {
    switch (lang) {
      case "en":
        return `Saved fiscal year is not set — all range from start to today is used (${ctx.allRangeLabel}). All opening stays in the Opening column.`;
      case "hi":
        return `सहेजा वित्तीय वर्ष सेट नहीं — शुरुआत से आज तक की पूरी सीमा उपयोग होती है (${ctx.allRangeLabel})। सारा opening Opening column में रहता है।`;
      case "ne":
        return `सेभ गरिएको आर्थिक वर्ष सेट छैन — सुरु देखि आजसम्मको सम्पूर्ण सीमा प्रयोग हुन्छ (${ctx.allRangeLabel})। सब opening Opening column मा नै रहन्छ।`;
    }
  }

  const splitNote =
    lang === "en"
      ? "Opening dated on/after fiscal start → Opening column 0, counted in movement."
      : lang === "hi"
        ? "वित्तीय वर्ष प्रारंभ के बाद/समान तिथि की opening → Opening column 0, movement में गिनी जाती है।"
        : "आर्थिक वर्ष सुरु पछि/सोही मितिको opening → Opening column 0, movement मा गनिन्छ।";

  return `Company fiscal year: ${ctx.savedLabel}. ${splitNote}`;
}

export type BalanceSheetDiffTraceReconciliationCopy = {
  totalDifferenceLabel: string;
  openingMismatchLabel: string;
  remainingAfterOpeningLabel: string;
  residualDifferenceLabel: string;
  hasResidual: boolean;
  openingIsBalanced: boolean;
};

export function balanceSheetOpeningMismatchIntroTitle(
  lang: BalanceSheetDiffTraceLang
): string {
  switch (lang) {
    case "en":
      return "Opening balance mismatch";
    case "hi":
      return "Opening balance mismatch";
    case "ne":
      return "Opening balance mismatch";
  }
}

/** First paragraph — master Dr/Cr not equal. */
export function balanceSheetOpeningMismatchIntroSummary(
  lang: BalanceSheetDiffTraceLang
): string {
  switch (lang) {
    case "en":
      return "Opening debit and credit on master accounts (party, bank, staff, tax, income/expense) are not equal.";
    case "hi":
      return "Master accounts (party, bank, staff, tax, income/expense) पर opening debit और credit बराबर नहीं हैं।";
    case "ne":
      return "Master accounts (party, bank, staff, tax, income/expense) मा opening debit र credit बराबर छैनन्।";
  }
}

export function balanceSheetDiffTraceReconciliationTitle(
  lang: BalanceSheetDiffTraceLang
): string {
  switch (lang) {
    case "en":
      return "Remaining after opening";
    case "hi":
      return "Opening के बाद बचा अंतर";
    case "ne":
      return "Opening पछि बाँकी अन्तर";
  }
}

/** Info popover on the other different trace pill — matches current 3-tab trace + Explain flow. */
export function balanceSheetDiffTraceReconciliationParagraphs(
  lang: BalanceSheetDiffTraceLang,
  copy: BalanceSheetDiffTraceReconciliationCopy
): string[] {
  const openingPart = copy.openingIsBalanced
    ? lang === "en"
      ? "opening mismatch is zero (master opening Dr − Cr balances)"
      : lang === "hi"
        ? "opening mismatch शून्य है (master opening Dr − Cr संतुलित)"
        : "opening mismatch शून्य छ (master opening Dr − Cr मिल्छ)"
    : lang === "en"
      ? `opening mismatch is ${copy.openingMismatchLabel} (master Dr − Cr audit)`
      : lang === "hi"
        ? `opening mismatch ${copy.openingMismatchLabel} है (master Dr − Cr audit)`
        : `opening mismatch ${copy.openingMismatchLabel} छ (master Dr − Cr audit)`;

  switch (lang) {
    case "en":
      return [
        `${copy.remainingAfterOpeningLabel} on this tab = Total Balance Sheet difference (${copy.totalDifferenceLabel}) minus ${openingPart}. Opening mismatch is explained in the Opening trace tab — do not count it twice here.`,
        `Step 1–2 on this tab split the remaining gap: opening excluded from Balance Sheet, opening classification spread, transaction layer (after net profit), and rounding. Use Explain for account-level teacher notes — each finding uses post-opening gap contribution, not gross voucher movement.`,
        `Opening trace = master opening audit list. trxn trace = per-account opening → movement → closing. All closing accounts = every non-zero closing with Dr/Cr and running balance. Data updates live from SQLite.`,
        ...(copy.hasResidual
          ? [
              `Step 3 may still show ${copy.residualDifferenceLabel} unexplained — review uncategorized ledgers, Asset vs Liability group mapping, and P/L parity on the main Balance Sheet check.`,
            ]
          : []),
      ];
    case "hi":
      return [
        `इस टैब पर ${copy.remainingAfterOpeningLabel} = कुल Balance Sheet अंतर (${copy.totalDifferenceLabel}) घटा ${openingPart}। Opening mismatch Opening trace टैब में समझाया जाता है — यहाँ दोबारा न घटाएँ।`,
        `यहाँ Step 1–2 बचे अंतर को बाँटते हैं: Balance Sheet से बाहर opening, opening classification spread, transaction layer (net profit के बाद), और rounding। Explain से खाता-स्तर teacher notes देखें — हर पंक्ति post-opening gap contribution दिखाती है, gross voucher movement नहीं।`,
        `Opening trace = master opening audit सूची। trxn trace = खाता-wise opening → movement → closing। All closing accounts = सभी non-zero closing Dr/Cr + running balance। SQLite से live अपडेट।`,
        ...(copy.hasResidual
          ? [
              `Step 3 में अभी भी ${copy.residualDifferenceLabel} अस्पष्ट हो सकता है — uncategorized ledgers, Asset/Liability समूह, और मुख्य Balance Sheet check में P/L parity जाँचें।`,
            ]
          : []),
      ];
    case "ne":
      return [
        `यो tab मा ${copy.remainingAfterOpeningLabel} = कुल Balance Sheet अन्तर (${copy.totalDifferenceLabel}) घटाउँदा ${openingPart}। Opening mismatch Opening trace tab मा व्याख्या हुन्छ — यहाँ दो पटक न घटाउनुहोस्।`,
        `यहाँ Step 1–2 बाँकी अन्तर विभाजन गर्छ: Balance Sheet बाहिर opening, opening classification spread, transaction layer (net profit पछि), र rounding। Explain बाट खाता-स्तर teacher notes — प्रत्येक पङ्क्ति post-opening gap contribution हो, gross voucher movement होइन।`,
        `Opening trace = master opening audit सूची। trxn trace = खाता अनुसार opening → movement → closing। All closing accounts = सबै non-zero closing Dr/Cr + running balance। SQLite बाट live अपडेट।`,
        ...(copy.hasResidual
          ? [
              `Step 3 मा अझै ${copy.residualDifferenceLabel} अस्पष्ट हुन सक्छ — uncategorized ledgers, Asset/Liability समूह, र मुख्य Balance Sheet check मा P/L parity जाँच गर्नुहोस्।`,
            ]
          : []),
      ];
  }
}
