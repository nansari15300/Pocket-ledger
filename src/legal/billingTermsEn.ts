/** English — Billing & SaaS terms (professional accounting-style SaaS). */
export interface BillingTermsDoc {
  documentTitle: string;
  lastUpdatedLabel: string;
  lastUpdatedISO: string;
  sections: { h: string; p: string[] }[];
}

export const BILLING_TERMS_EN: BillingTermsDoc = {
  documentTitle: "Terms & Conditions — Billing, Subscriptions & Services",
  lastUpdatedLabel: "Last updated",
  lastUpdatedISO: "2026-05-10",
  sections: [
    {
      h: "1. Introduction and acceptance",
      p: [
        "These Terms & Conditions (“Terms”) govern your access to and use of the software service, including subscription plans, payments, upgrades, downgrades, and related features (collectively, the “Service”). By creating an account, subscribing to a paid plan, making a payment, or continuing to use the Service after we post changes, you agree to these Terms on behalf of yourself and any company or entity you represent (“you”, “your”). If you do not agree, do not use paid features or subscribe.",
        "We may update these Terms from time to time. Material changes will be indicated by updating the “Last updated” date at the top of this document. Your continued use after changes constitutes acceptance of the revised Terms, except where applicable law requires otherwise.",
      ],
    },
    {
      h: "2. Definitions",
      p: [
        "“Provider”, “we”, “us” refers to the operator of the Service. “User” means an individual who accesses the Service. “Company” or “organization” means the business entity whose data is stored under a subscription. “Plan” means a subscription tier (e.g. Basic, Advance, Pro, Pro Plus) with associated entitlements and prices. “Subscription period” means the time for which access is granted based on payment or promotional rules. “Payment gateway” means third-party processors such as Stripe, Khalti, or eSewa used to collect payments.",
      ],
    },
    {
      h: "3. Eligibility and account responsibility",
      p: [
        "You must be legally able to enter into a contract in your jurisdiction. You are responsible for maintaining the confidentiality of login credentials and for all activity under your account. For company-scoped billing, the designated owner or authorized payer is responsible for plan selection, payment method, and compliance with these Terms.",
        "You must provide accurate billing and contact information. Failure to maintain valid payment details may result in failed renewals, suspension of paid features, or downgrade according to our policies and applicable product settings.",
      ],
    },
    {
      h: "4. Nature of the Service (software only)",
      p: [
        "The Service provides software tools for accounting, bookkeeping, and related workflows. We are not a bank, financial institution, tax authority, or professional accounting firm. Nothing in the Service constitutes legal, tax, or professional accounting advice. You should consult qualified professionals for decisions that affect your business, taxes, or regulatory compliance.",
        "Outputs, reports, and calculations depend on data you enter, integrations, and system configuration. You remain solely responsible for the accuracy of your books and statutory filings.",
      ],
    },
    {
      h: "5. Subscription plans and entitlements",
      p: [
        "Plans, prices, feature limits (users, companies, vouchers, storage, devices, etc.), and descriptions may be shown in the application or admin-configured catalog. We may change list prices or entitlements for new purchases; existing subscription terms may continue until renewal or change according to the rules in effect at the time of each transaction.",
        "Free or Basic tiers may have limited features. Paid tiers unlock additional capacity and features as described in the product. Misuse of limits (e.g. circumventing caps) may result in enforcement actions described under suspension and termination.",
      ],
    },
    {
      h: "6. Fees, currency, and taxes",
      p: [
        "Fees are quoted in the currency shown at checkout (e.g. NPR) unless stated otherwise. You are responsible for any taxes, levies, or duties imposed by your jurisdiction. Displayed totals may exclude certain third-party fees charged by payment providers or banks.",
        "Where the product shows “रु” or NPR amounts, minor rounding may occur at gateways or in display formatting. You authorize us and our payment partners to charge the agreed amounts using your selected payment method.",
      ],
    },
    {
      h: "7. Proration, credits, usage estimates — important disclaimer",
      p: [
        "The Service may display prorated amounts, “credit” days, “usage” estimates, frozen snapshots after plan changes, and similar figures to help you understand subscription value. These displays are based on internal formulas (e.g. yearly rates, remaining time, tier switches) and are provided for convenience only.",
        "YOU ACKNOWLEDGE THAT ALL SUCH CALCULATIONS, QUOTES, ROUNDS, AND UI DISPLAYS MAY CONTAIN ERRORS, ROUNDING DIFFERENCES, EDGE-CASE MISMATCHES, OR DELAYS IN SYNC WITH PAYMENT PROVIDERS OR DATABASE STATE. THEY ARE NOT GUARANTEED TO BE AUDIT-PRECISE OR IDENTICAL TO INVOICES GENERATED BY STRIPE OR OTHER GATEWAYS. BEFORE RELYING ON ANY FIGURE FOR COMMERCIAL OR LEGAL PURPOSES, VERIFY INDEPENDENTLY OR CONTACT SUPPORT.",
        "If a discrepancy is identified, our reasonable determination after investigation (which may require logs from payment partners) will govern corrective action, which may include manual adjustment, refund at our discretion where legally appropriate, or no change if the charge was valid under partner terms.",
      ],
    },
    {
      h: "8. Payments, invoices, and third-party gateways",
      p: [
        "Payments are processed by third-party gateways. Your use of those services is also subject to their terms and privacy policies. We do not store full card numbers on our servers in place of the gateway’s vault where applicable.",
        "Successful payment does not guarantee uninterrupted service if technical failures, chargebacks, or fraud reviews occur. A record in your “payments” or statement view is informational and may lag behind the gateway’s authoritative status.",
      ],
    },
    {
      h: "9. Auto-renewal and failed charges",
      p: [
        "Where you enable automatic renewal with a supported Stripe subscription, renewals may be attempted on your saved payment method according to Stripe’s schedule. If you disable auto-renewal, the subscription may be set to cancel at the end of the current billing period; you may need to pay manually before access expires.",
        "Failed charges may trigger retries by the payment provider. Optional in-app policies (such as short grace extensions or notices) are described in product documentation and may change. They do not waive your obligation to maintain valid payment or to pay amounts legitimately due.",
      ],
    },
    {
      h: "10. Non-refundable and conditional refunds",
      p: [
        "Except where required by applicable law or explicitly offered in writing by us, all subscription and plan-change payments are generally NON-REFUNDABLE once successfully processed. This includes partial periods, unused time after downgrade, or voluntary cancellation mid-term.",
        "Chargebacks or payment disputes initiated without first contacting support may result in suspension of the account and reversal of access. Any refund granted is goodwill or legal compliance only and does not establish a precedent.",
      ],
    },
    {
      h: "11. Upgrades, downgrades, and plan changes",
      p: [
        "Upgrades and certain plan changes may be priced using proration rules shown in the app. Downgrades to a lower paid tier or to Basic may convert remaining subscription value into longer time at the lower rate or follow separate product rules (including administrator toggles that restrict downgrades).",
        "“Just change plan” or zero-net upgrades adjust expiry and entitlements without a new payment only when the product explicitly allows and the server accepts the request. You are responsible for understanding the effect on your expiry date and entitlements before confirming.",
      ],
    },
    {
      h: "12. Service availability, maintenance, and disturbances",
      p: [
        "We strive to provide reliable service but do not guarantee uninterrupted or error-free operation. The Service may be unavailable due to maintenance, security patches, infrastructure failures, internet outages, dependency failures (hosting, DNS, databases, payment APIs), or events outside our reasonable control.",
        "Scheduled maintenance may not always be announced in advance. We are not liable for loss of profits, data entry delays, missed deadlines, or business interruption caused by downtime, degraded performance, or third-party service disturbances, except where prohibited by law.",
      ],
    },
    {
      h: "13. Force majeure",
      p: [
        "Neither party is liable for failure or delay due to events beyond reasonable control, including natural disasters, war, terrorism, riots, fire, epidemic, government orders, strikes, supply chain failures, or failure of public utilities or telecommunications networks.",
      ],
    },
    {
      h: "14. Data, backups, and security",
      p: [
        "You are responsible for maintaining your own backups and export practices where the product allows. While we implement reasonable security measures, no system is immune to breach or data loss. You use the Service at your own risk regarding data integrity and availability.",
        "Features such as encryption, offline mode, or sync may behave differently per device or configuration. You must safeguard devices and credentials that access company data.",
      ],
    },
    {
      h: "15. Acceptable use",
      p: [
        "You may not use the Service to violate law, infringe rights, distribute malware, attempt unauthorized access, overload systems, scrape in violation of terms, or resell access without permission. We may suspend or terminate accounts for abuse, fraud, or risk to other users.",
      ],
    },
    {
      h: "16. Intellectual property",
      p: [
        "The Service, including software, branding, documentation, and UI, is protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable right to use the Service during an active subscription or permitted trial. You may not reverse engineer except as allowed by mandatory law, copy proprietary materials for competing products, or remove notices.",
      ],
    },
    {
      h: "17. Limitation of liability",
      p: [
        "TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE PROVIDER OR ITS AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, GOODWILL, OR DATA, ARISING FROM YOUR USE OF THE SERVICE OR BILLING FEATURES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
        "OUR AGGREGATE LIABILITY FOR CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO US FOR THE SERVICE IN THE THREE (3) MONTHS BEFORE THE CLAIM, OR (B) THE MINIMUM AMOUNT ALLOWABLE UNDER APPLICABLE LAW. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN SUCH CASES OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED.",
      ],
    },
    {
      h: "18. Indemnity",
      p: [
        "You agree to indemnify and hold harmless the Provider and its affiliates, officers, and employees from claims, damages, losses, and expenses (including reasonable attorneys’ fees) arising from your use of the Service, your data, your violation of these Terms, or your violation of third-party rights.",
      ],
    },
    {
      h: "19. Suspension and termination",
      p: [
        "We may suspend or terminate access for non-payment, breach of Terms, legal requirement, or risk to the platform. Upon termination, your right to use paid features ceases; data retention and export may be subject to product behavior and backup policies. You may terminate by stopping use and canceling subscriptions according to in-app controls.",
      ],
    },
    {
      h: "20. Changes to the Service and pricing",
      p: [
        "We may modify, deprecate, or discontinue features. We may change how billing works with reasonable notice where practicable. Continued use after changes constitutes acceptance unless you cancel in accordance with product rules.",
      ],
    },
    {
      h: "21. Governing law and disputes",
      p: [
        "These Terms are governed by the laws applicable in Nepal, without regard to conflict-of-law rules, unless mandatory consumer protections in your country require otherwise. Courts in Nepal shall have exclusive jurisdiction for disputes arising from these Terms, subject to non-waivable rights you may have in your home jurisdiction.",
        "You agree to first contact support to attempt informal resolution before initiating formal proceedings where reasonable.",
      ],
    },
    {
      h: "22. Miscellaneous",
      p: [
        "If any provision is held invalid, the remainder remains in effect. No waiver of a breach is a waiver of other breaches. You may not assign these Terms without our consent; we may assign in connection with a merger or sale. These Terms constitute the entire agreement regarding billing and subscription use of the Service, superseding prior oral or written understandings on the same subject.",
      ],
    },
    {
      h: "23. Contact",
      p: [
        "For billing questions, discrepancies, or legal notices related to these Terms, use the contact channels provided in the application or on the official website. Include your company identifier, user email, and payment reference where applicable to expedite review.",
      ],
    },
    {
      h: "24. No professional or audit warranty",
      p: [
        "The Service is not designed or warranted to meet statutory audit, assurance, or regulatory filing standards unless a separate written agreement explicitly states so. You must perform your own reconciliation, sampling, and controls. Any templates, tax mappings, or reports are aids only and may not reflect the latest rules in your jurisdiction.",
      ],
    },
    {
      h: "25. Integrations and third-party data",
      p: [
        "If you connect banks, payment apps, e-commerce, payroll, or other integrations, their accuracy, latency, and licensing are governed by those third parties. We are not responsible for import errors, duplicate transactions, categorization mistakes, or API changes that alter behavior without notice.",
      ],
    },
    {
      h: "26. Mobile, offline, and sync modes",
      p: [
        "Features available on mobile, desktop, or offline may differ. Conflict resolution between devices, clock skew, and partial sync can produce temporary inconsistencies. You are responsible for resolving conflicts and verifying totals before relying on them for decisions.",
      ],
    },
    {
      h: "27. Export, retention, and closure",
      p: [
        "After subscription ends or account closure, access to export tools may be limited by product policy. You should export critical data while your subscription is active. We may delete or anonymize data after retention periods required by law or internal policy, subject to backup and legal hold constraints.",
      ],
    },
    {
      h: "28. Marketing, communications, and receipts",
      p: [
        "We may send transactional emails or in-app messages about billing, security, and product changes. Promotional communications, where used, will follow applicable consent rules. Receipts or invoices from gateways are the primary payment records; in-app statements are supplementary.",
      ],
    },
    {
      h: "29. Beta and experimental features",
      p: [
        "Features labeled beta, preview, or experimental may be unstable, change without notice, or be withdrawn. They are provided “as is” without the same reliability expectations as generally available features unless we state otherwise in writing.",
      ],
    },
    {
      h: "30. Record retention for disputes",
      p: [
        "You should retain your own copies of agreements, tax filings, and gateway receipts. Our logs and database snapshots may be retained for a limited period and may not be available indefinitely for dispute resolution.",
      ],
    },
  ],
};
