export type BsCheckHelpLang = "en" | "hi" | "ne";

export type BsCheckHelpBlock = {
  title: string;
  intro: string;
  whatWrong: string;
  whatToDo: string[];
  mappingHint?: string;
};

export type BsCheckHelpCopy = Record<BsCheckHelpLang, BsCheckHelpBlock>;

export const BS_CHECK_ENGINE_HELP: Record<string, BsCheckHelpCopy> = {
  equation: {
    en: {
      title: "Balance Sheet equation",
      intro:
        "Checks whether Assets equal Liabilities + Equity + Net Profit. This is the main Balance Sheet balance test (different from voucher Dr = Cr).",
      whatWrong:
        "The left side (Assets) does not match the right side (Liabilities + Equity + current profit/loss). The red amount is the total gap.",
      whatToDo: [
        "Use the reconciliation table above — it splits the gap into opening, classification, and transaction parts.",
        "Fix opening mismatch and excluded opening accounts first.",
        "Then review group mapping (Asset vs Liability) and uncategorized ledgers.",
        "Re-run checks after each fix.",
      ],
    },
    hi: {
      title: "Balance Sheet equation",
      intro:
        "Ye check karta hai: Assets = Liabilities + Equity + Net Profit. Ye main BS balance test hai (voucher Dr = Cr se alag).",
      whatWrong:
        "Assets aur (Liabilities + Equity + P/L) barabar nahi hain. Red amount total difference hai.",
      whatToDo: [
        "Upar wali reconciliation table dekho — gap opening, classification aur transaction me split hota hai.",
        "Pehle opening mismatch aur excluded opening accounts fix karo.",
        "Phir group mapping (Asset vs Liability) aur uncategorized ledgers check karo.",
        "Har fix ke baad checks dubara chalao.",
      ],
    },
    ne: {
      title: "Balance Sheet equation",
      intro:
        "Assets = Liabilities + Equity + Net Profit हो कि होइन भनेर जाँच गर्छ। यो मुख्य BS balance test हो (voucher Dr = Cr भन्दा अलग)।",
      whatWrong:
        "Assets र (Liabilities + Equity + P/L) मिलेन। रातो रकम कुल difference हो।",
      whatToDo: [
        "माथिको reconciliation table हेर्नुहोस् — gap opening, classification र transaction मा बाँडिन्छ।",
        "पहिले opening mismatch र excluded opening accounts मिलाउनुहोस्।",
        "पछि group mapping (Asset vs Liability) र uncategorized ledgers जाँच गर्नुहोस्।",
        "प्रत्येक fix पछि checks फेरि चलाउनुहोस्।",
      ],
    },
  },
  gap_identity: {
    en: {
      title: "Account gap identity",
      intro: "Internal math check: sum of every account’s BS equation contribution minus net profit must equal the total difference.",
      whatWrong: "Internal calculation mismatch — contact support if this fails while equation check also fails.",
      whatToDo: ["Re-run checks.", "If it keeps failing, refresh the page and run again."],
    },
    hi: {
      title: "Account gap identity",
      intro: "Internal math: sab accounts ke gap ka sum − net profit = total difference hona chahiye.",
      whatWrong: "Andar ka calculation match nahi — agar equation bhi fail ho to support se contact karo.",
      whatToDo: ["Checks dubara chalao.", "Page refresh karke phir try karo."],
    },
    ne: {
      title: "Account gap identity",
      intro: "Internal math: सबै account gap को योग − net profit = total difference हुनुपर्छ।",
      whatWrong: "भित्री गणना मिलेन — equation पनि fail भए support लाई सम्पर्क गर्नुहोस्।",
      whatToDo: ["Checks फेरि चलाउनुहोस्।", "Page refresh गरी पुन: प्रयास गर्नुहोस्।"],
    },
  },
  double_entry: {
    en: {
      title: "Voucher double-entry",
      intro: "Checks that each voucher type in the loop has Total Debit = Total Credit across all transactions.",
      whatWrong: "Some vouchers may have Dr ≠ Cr, or a voucher type is not included in this check.",
      whatToDo: [
        "Scroll to Double-Entry Check on the page.",
        "Open problematic vouchers and fix journal entries.",
        "Green here does NOT mean Balance Sheet is balanced — only vouchers are balanced.",
      ],
    },
    hi: {
      title: "Voucher double-entry",
      intro: "Har voucher me Total Dr = Total Cr hai ya nahi — ye check karta hai.",
      whatWrong: "Kuch vouchers me Dr ≠ Cr ho sakta hai, ya koi type is check me shamil nahi.",
      whatToDo: [
        "Page par Double-Entry Check section dekho.",
        "Problem vouchers kholo aur entries fix karo.",
        "Yahan green matlab BS balanced nahi — sirf vouchers balanced hain.",
      ],
    },
    ne: {
      title: "Voucher double-entry",
      intro: "प्रत्येक voucher मा Total Dr = Total Cr छ कि छैन जाँच गर्छ।",
      whatWrong: "केही voucher मा Dr ≠ Cr हुन सक्छ, वा कुनै type यो check मा छैन।",
      whatToDo: [
        "Page को Double-Entry Check section हेर्नुहोस्।",
        "Problem vouchers खोलि entries मिलाउनुहोस्।",
        "Green भन्दा BS balanced भयो भन्ने होइन — voucher मात्र balanced।",
      ],
    },
  },
  opening_mismatch: {
    en: {
      title: "Opening balance Dr − Cr (masters)",
      intro:
        "Adds all master opening balances (party, bank, staff, tax, expense). Dr and Cr sides should net to zero when System Opening Balance counter is correct.",
      whatWrong:
        "Total Opening Dr ≠ Total Opening Cr on master accounts. System Opening Balance (Equity) should offset this — if it is stale, BS difference grows.",
      whatToDo: [
        "Open Opening Balance ledger page — review listed accounts.",
        "Correct wrong opening Dr/Cr on each master.",
        "Use Reconcile on System Opening Balance if stored value is stale.",
        "After delete/restore/import, run Reconcile once.",
      ],
      mappingHint:
        "Debtors → Sundry Debtors (Asset). Creditors → Sundry Creditors (Liability). Bank → Bank Accounts (Asset). Do not leave masters without a group.",
    },
    hi: {
      title: "Opening balance Dr − Cr (masters)",
      intro:
        "Sab master opening (party, bank, staff, tax, expense) jod kar Dr − Cr check. System Opening Balance se zero hona chahiye.",
      whatWrong:
        "Master opening Dr aur Cr barabar nahi. System Opening Balance (Equity) ise offset karta hai — stale ho to BS difference badhta hai.",
      whatToDo: [
        "Opening Balance ledger page kholo — accounts dekho.",
        "Galat opening Dr/Cr sahi karo.",
        "System OB stale ho to Reconcile chalao.",
        "Delete/restore/import ke baad ek baar Reconcile karo.",
      ],
      mappingHint:
        "Debtors → Sundry Debtors (Asset). Creditors → Sundry Creditors (Liability). Bank → Bank Accounts (Asset). Bina group mat chhodo.",
    },
    ne: {
      title: "Opening balance Dr − Cr (masters)",
      intro:
        "सबै master opening (party, bank, staff, tax, expense) जोडेर Dr − Cr जाँच। System Opening Balance ले zero हुनुपर्छ।",
      whatWrong:
        "Master opening Dr र Cr मिलेन। System Opening Balance (Equity) ले offset गर्छ — stale भए BS difference बढ्छ।",
      whatToDo: [
        "Opening Balance ledger page खोल्नुहोस्।",
        "गलत opening Dr/Cr सच्याउनुहोस्।",
        "System OB stale भए Reconcile चलाउनुहोस्।",
        "Delete/restore/import पछि एक पटक Reconcile।",
      ],
      mappingHint:
        "Debtors → Sundry Debtors (Asset). Creditors → Sundry Creditors (Liability). Bank → Bank Accounts (Asset)। Group बिना नछोड्नुहोस्।",
    },
  },
  net_profit_parity: {
    en: {
      title: "BS net profit vs P&L",
      intro: "Balance Sheet net profit and Profit & Loss report must use the same income/expense ledger formula.",
      whatWrong: "BS and P&L net profit differ — usually a bug or date filter mismatch.",
      whatToDo: [
        "Clear date filter on Balance Sheet and compare with full-period P&L.",
        "Check income/expense accounts are under correct nominal groups.",
      ],
    },
    hi: {
      title: "BS net profit vs P&L",
      intro: "BS aur P&L ka net profit same formula se aana chahiye.",
      whatWrong: "BS aur P&L net profit alag — date filter ya nominal group issue ho sakta hai.",
      whatToDo: [
        "BS par date filter hata kar full P&L se compare karo.",
        "Income/expense accounts sahi nominal group me hain verify karo.",
      ],
    },
    ne: {
      title: "BS net profit vs P&L",
      intro: "BS र P&L net profit एउटै formula बाट आउनुपर्छ।",
      whatWrong: "BS र P&L net profit फरक — date filter वा nominal group समस्या।",
      whatToDo: [
        "BS को date filter हटाएर full P&L सँग तुलना गर्नुहोस्।",
        "Income/expense accounts सही nominal group मा छन् जाँच गर्नुहोस्।",
      ],
    },
  },
  system_ob: {
    en: {
      title: "System Opening Balance",
      intro:
        "System party opening_balance_ledger (Equity) should equal −Σ(all master opening balances). Stored value can drift after delete, import, or restore.",
      whatWrong: "Stored System OB ≠ expected from current masters. BS may show wrong equity until reconciled.",
      whatToDo: [
        "Opening Balance page → Reconcile System Opening Balance (explicit button).",
        "Do not manually edit the system party unless you know the impact.",
      ],
    },
    hi: {
      title: "System Opening Balance",
      intro:
        "System Opening Balance (Equity) = −(sab master opening ka sum) hona chahiye. Delete/import/restore ke baad stale ho sakta hai.",
      whatWrong: "Stored value expected se alag — reconcile karo.",
      whatToDo: [
        "Opening Balance page → Reconcile button dabao.",
        "System party manually mat badlo bina samjhe.",
      ],
    },
    ne: {
      title: "System Opening Balance",
      intro:
        "System Opening Balance (Equity) = −(सबै master opening को योग) हुनुपर्छ। delete/import/restore पछि stale हुन सक्छ।",
      whatWrong: "Stored value expected भन्दा फरक — reconcile गर्नुहोस्।",
      whatToDo: [
        "Opening Balance page → Reconcile button।",
        "System party बुझेर मात्र edit गर्नुहोस्।",
      ],
    },
  },
  opening_excluded: {
    en: {
      title: "Opening excluded from Balance Sheet",
      intro:
        "These masters have an opening balance in the audit but zero/filtered closing — so they affect Dr−Cr audit but not BS totals.",
      whatWrong:
        "Opening is counted in mismatch but the account does not appear on Balance Sheet (often zero closing balance).",
      whatToDo: [
        "Open each listed account — verify opening balance is correct.",
        "If opening should stay, ensure account has activity or appears on BS via correct group.",
        "If opening is wrong, edit or zero it on the master.",
      ],
      mappingHint: "Assign Asset or Liability group so the ledger appears on Balance Sheet when it has balance.",
    },
    hi: {
      title: "Opening excluded from Balance Sheet",
      intro:
        "In masters par opening hai lekin BS par nahi (zero closing / filtered). Audit me count hota hai, BS total me nahi.",
      whatWrong: "Opening audit me hai par Balance Sheet par account nahi dikhta.",
      whatToDo: [
        "Har account kholo — opening sahi hai verify karo.",
        "Sahi group do taaki balance par BS par aaye.",
        "Galat opening ho to master par edit karo.",
      ],
      mappingHint: "Asset ya Liability group assign karo — tab hi BS par dikhega.",
    },
    ne: {
      title: "Opening excluded from Balance Sheet",
      intro:
        "यी master मा opening छ तर BS मा छैन (zero closing)। audit मा गन्छ, BS total मा होइन।",
      whatWrong: "Opening audit मा छ, Balance Sheet मा account देखिँदैन।",
      whatToDo: [
        "प्रत्येक account खोलि opening जाँच गर्नुहोस्।",
        "सही group दिनुहोस्।",
        "गलत opening भए master मा edit गर्नुहोस्।",
      ],
      mappingHint: "Asset वा Liability group दिनुहोस्।",
    },
  },
  opening_spread: {
    en: {
      title: "Opening BS classification spread",
      intro:
        "Same opening amount affects Dr−Cr audit differently than Balance Sheet columns when group is Asset vs Liability.",
      whatWrong:
        "Opening balances are mapped to Asset/Liability groups in a way that spreads BS impact beyond simple Dr−Cr mismatch.",
      whatToDo: [
        "Review each listed account’s group (Debtors vs Creditors, Bank, etc.).",
        "Move party to correct system group if misclassified.",
        "Example: creditor party in Sundry Debtors (Asset) causes double-side effect.",
      ],
      mappingHint:
        "Customer (you sell) → Sundry Debtors. Supplier (you buy) → Sundry Creditors. Loan → Liability group. Bank/Cash → Asset.",
    },
    hi: {
      title: "Opening BS classification spread",
      intro:
        "Wahi opening Dr−Cr audit aur BS column me alag effect deta hai jab group Asset vs Liability ho.",
      whatWrong: "Opening sahi group me nahi — BS par spread badh jata hai.",
      whatToDo: [
        "Har account ka group check karo.",
        "Galat group ho to sahi system group me move karo.",
        "Example: supplier ko Sundry Debtors me mat rakho — Creditors me rakho.",
      ],
      mappingHint:
        "Customer → Sundry Debtors. Supplier → Sundry Creditors. Loan → Liability. Bank → Asset.",
    },
    ne: {
      title: "Opening BS classification spread",
      intro:
        "एउटै opening Dr−Cr audit र BS column मा फरक प्रभाव — group Asset vs Liability अनुसार।",
      whatWrong: "Opening गलत group मा — BS spread बढ्छ।",
      whatToDo: [
        "प्रत्येक account को group जाँच गर्नुहोस्।",
        "गलत group भए सही system group मा सार्नुहोस्।",
      ],
      mappingHint:
        "Customer → Sundry Debtors. Supplier → Sundry Creditors. Loan → Liability. Bank → Asset.",
    },
  },
  transaction_layer: {
    en: {
      title: "Transaction layer (after P&L)",
      intro:
        "All voucher activity on Balance Sheet accounts, minus net profit transferred from P&L. This is the main non-opening part of the gap.",
      whatWrong: "Transactions and/or account classification create BS gap beyond opening mismatch.",
      whatToDo: [
        "Review Top transaction drivers below.",
        "Check VAT, bank loans, exit accounts, and parties with unexpected Dr/Cr.",
        "Verify large bank ↔ loan pairs net correctly.",
      ],
      mappingHint:
        "Tax VAT → Liability (Vats). Bank loan liability → Loan group. Negative bank balance stays on Asset side as credit balance.",
    },
    hi: {
      title: "Transaction layer (after P&L)",
      intro:
        "Voucher activity ka net effect (minus P&L transfer). Opening ke alawa bacha gap yahi se aata hai.",
      whatWrong: "Transactions ya galat group ki wajah se gap badha hua hai.",
      whatToDo: [
        "Neeche Top transaction drivers dekho.",
        "VAT, bank loan, exit accounts, unexpected Dr/Cr wale accounts check karo.",
      ],
      mappingHint:
        "VAT → Liability group. Bank loan → Loan liability. Minus bank balance Asset par credit dikhega.",
    },
    ne: {
      title: "Transaction layer (after P&L)",
      intro:
        "Voucher activity को net (minus P&L)। opening बाहेकको gap यहाँबाट।",
      whatWrong: "Transaction वा गलत group le gap बढ्यो।",
      whatToDo: [
        "Top transaction drivers हेर्नुहोस्।",
        "VAT, bank loan, exit accounts जाँच गर्नुहोस्।",
      ],
      mappingHint: "VAT → Liability। Bank loan → Loan group।",
    },
  },
  uncategorized: {
    en: {
      title: "Uncategorized ledgers",
      intro: "Ledgers with no valid Asset / Liability / Equity group are excluded from Balance Sheet totals.",
      whatWrong: "Accounts exist with balance but no BS group — they do not appear on the sheet.",
      whatToDo: [
        "Scroll to Uncategorized section on Balance Sheet.",
        "Edit each account → assign Parent Group (Debtors, Creditors, Bank, etc.).",
        "Use Resave if group was recently changed.",
      ],
      mappingHint: "Party → Party groups. Bank → Account groups. Staff/Tax → respective groups.",
    },
    hi: {
      title: "Uncategorized ledgers",
      intro: "Jin ka Asset/Liability/Equity group nahi, wo Balance Sheet par nahi aate.",
      whatWrong: "Balance hai par group missing — BS se bahar hain.",
      whatToDo: [
        "Balance Sheet par Uncategorized section dekho.",
        "Har account ko sahi Parent Group do.",
        "Resave button try karo.",
      ],
      mappingHint: "Party → Party group. Bank → Bank group. Staff/Tax → apna group.",
    },
    ne: {
      title: "Uncategorized ledgers",
      intro: "Asset/Liability/Equity group नभएका ledgers BS मा आउँदैनन्।",
      whatWrong: "Balance छ तर group छैन।",
      whatToDo: [
        "Uncategorized section हेर्नुहोस्।",
        "Parent Group assign गर्नुहोस्।",
        "Resave प्रयास गर्नुहोस्।",
      ],
      mappingHint: "Party → Party group। Bank → Bank group।",
    },
  },
  unexpected_sign: {
    en: {
      title: "Unexpected balance sign",
      intro:
        "Account is classified Asset but closes Credit, or Liability but closes Debit. BS puts credit asset balance on Liability column (double effect on gap).",
      whatWrong: "Chart class and closing sign disagree — often wrong group or wrong natural balance.",
      whatToDo: [
        "If party is supplier, move to Sundry Creditors (Liability).",
        "If bank is overdrawn, keep as Bank Asset — or reclassify only if it is truly a loan.",
        "Review each listed account ledger for wrong entries.",
      ],
      mappingHint:
        "Asset + Cr closing → often should be Liability (Creditor). Liability + Dr closing → often should be Asset (Debtor).",
    },
    hi: {
      title: "Unexpected balance sign",
      intro:
        "Asset group par Cr balance ya Liability par Dr — BS equation par double effect padta hai.",
      whatWrong: "Group aur closing sign match nahi karte.",
      whatToDo: [
        "Supplier party ko Creditors group me rakho.",
        "Overdrawn bank verify karo — loan ho to Liability group.",
        "Galat entries check karo.",
      ],
      mappingHint: "Asset + Cr → aksar Creditor (Liability). Liability + Dr → aksar Debtor (Asset).",
    },
    ne: {
      title: "Unexpected balance sign",
      intro:
        "Asset मा Cr वा Liability मा Dr — BS equation मा दोहोरो असर।",
      whatWrong: "Group र closing sign मिलेन।",
      whatToDo: [
        "Supplier लाई Creditors group मा राख्नुहोस्।",
        "Bank overdraft जाँच गर्नुहोस्।",
      ],
      mappingHint: "Asset + Cr → प्रायः Creditor। Liability + Dr → प्रायः Debtor।",
    },
  },
  unhandled_vouchers: {
    en: {
      title: "Unhandled voucher types",
      intro: "These voucher types are not fully included in the Balance Sheet double-entry summary loop.",
      whatWrong: "Some transactions may not be validated by Dr = Cr check on this page.",
      whatToDo: [
        "Review listed vouchers manually in their forms.",
        "Ensure amount and entries are complete.",
      ],
    },
    hi: {
      title: "Unhandled voucher types",
      intro: "Ye voucher types BS double-entry loop me poori tarah shamil nahi.",
      whatWrong: "In vouchers ka Dr/Cr is page par verify nahi hua.",
      whatToDo: ["Vouchers manually kholo aur entries check karo."],
    },
    ne: {
      title: "Unhandled voucher types",
      intro: "यी voucher types BS double-entry loop मा पूर्ण छैनन्।",
      whatWrong: "Dr/Cr यो page मा verify भएन।",
      whatToDo: ["Vouchers manually जाँच गर्नुहोस्।"],
    },
  },
  unbalanced_vouchers: {
    en: {
      title: "Unbalanced vouchers",
      intro: "One or more vouchers have Total Debit ≠ Total Credit.",
      whatWrong: "Broken double-entry in a voucher — must fix before books are reliable.",
      whatToDo: ["Open each problematic voucher.", "Fix journal lines so Dr = Cr."],
    },
    hi: {
      title: "Unbalanced vouchers",
      intro: "Kuch vouchers me Dr ≠ Cr hai.",
      whatWrong: "Voucher ki double-entry tooti hai.",
      whatToDo: ["Problem voucher kholo.", "Dr = Cr karo."],
    },
    ne: {
      title: "Unbalanced vouchers",
      intro: "केही voucher मा Dr ≠ Cr।",
      whatWrong: "Voucher double-entry बिग्रियो।",
      whatToDo: ["Voucher खोलि Dr = Cr मिलाउनुहोस्।"],
    },
  },
  remaining_after_opening: {
    en: {
      title: "Remaining after opening",
      intro: "Total BS difference minus opening Dr−Cr mismatch. Split into excluded opening, classification spread, and transaction net.",
      whatWrong: "This is the amount still unexplained after master opening Dr ≠ Cr.",
      whatToDo: [
        "Use the Remaining breakdown table (right side).",
        "Fix each line: excluded accounts, group mapping, then large transaction drivers.",
      ],
    },
    hi: {
      title: "Remaining after opening",
      intro: "Total difference − opening mismatch. Isme excluded opening, classification aur transaction net hai.",
      whatWrong: "Opening fix ke baad bacha hua gap.",
      whatToDo: [
        "Right side Remaining breakdown dekho.",
        "Excluded accounts, group mapping, phir bade transaction drivers fix karo.",
      ],
    },
    ne: {
      title: "Remaining after opening",
      intro: "Total difference − opening mismatch। excluded, classification, transaction net।",
      whatWrong: "Opening fix पछि बाँकी gap।",
      whatToDo: [
        "Remaining breakdown table हेर्नुहोस्।",
        "Excluded, mapping, transaction drivers मिलाउनुहोस्।",
      ],
    },
  },
  reconciliation_table: {
    en: {
      title: "Reconciliation table",
      intro: "Exact mathematical split of total Balance Sheet difference. All rows must add up to the total difference.",
      whatWrong: "N/A — this is a summary, not a pass/fail check.",
      whatToDo: [
        "Work top to bottom: opening mismatch → excluded → classification → transactions → net profit.",
      ],
    },
    hi: {
      title: "Reconciliation table",
      intro: "Total BS difference ka exact math split. Sab rows ka sum total ke barabar hona chahiye.",
      whatWrong: "Ye summary hai — pass/fail nahi.",
      whatToDo: ["Upar se neeche fix karo: opening → excluded → classification → transaction → P/L."],
    },
    ne: {
      title: "Reconciliation table",
      intro: "Total BS difference को exact split। सब rows को योग total सँग मिल्नुपर्छ।",
      whatWrong: "Summary हो — pass/fail होइन।",
      whatToDo: ["Opening → excluded → classification → transaction → P/L क्रममा fix गर्नुहोस्।"],
    },
  },
};

export function getBsCheckHelp(checkId: string): BsCheckHelpCopy | null {
  return BS_CHECK_ENGINE_HELP[checkId] ?? null;
}
