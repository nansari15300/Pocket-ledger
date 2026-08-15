import type { EntitlementKey } from "@/config/plans";

export type BillingHelpLang = "en" | "hi" | "ne";

export type BillingHelpCopy = {
  title: Record<BillingHelpLang, string>;
  body: Record<BillingHelpLang, string>;
};

/** Pricing / footer rows that are not EntitlementKey. */
export type BillingMetaHelpKey = "price-monthly" | "price-yearly" | "price-save" | "term-action";

export type BillingHelpKey = EntitlementKey | BillingMetaHelpKey;

const CAP_NOTE =
  "Values: 0 / None = not allowed; -1 = Unlimited; a positive number = that hard cap.";

export const BILLING_FEATURE_HELP: Partial<Record<BillingHelpKey, BillingHelpCopy>> = {
  "price-monthly": {
    title: {
      en: "Monthly price",
      hi: "मासिक कीमत",
      ne: "मासिक मूल्य",
    },
    body: {
      en: "List price for one month in the country you selected above. Free plans may show Free. Struck-through amounts are list prices when a free/offer override applies.",
      hi: "ऊपर चुने देश की मुद्रा में एक महीने की सूची कीमत। निःशुल्क प्लान पर Free दिख सकता है। काटी गई कीमत सूची दर है जब ऑफर/फ्री लागू हो।",
      ne: "माथि चयनित देशको मुद्रामा एक महिनाको सूची मूल्य। निःशुल्क योजनामा Free देखिन सक्छ। काटिएको रकम सूची दर हो जब अफर/फ्री लागू हुन्छ।",
    },
  },
  "price-yearly": {
    title: {
      en: "Yearly price",
      hi: "वार्षिक कीमत",
      ne: "वार्षिक मूल्य",
    },
    body: {
      en: "Prepaid price for 12 months in your selected country currency. Usually less than 12× monthly (see Save row).",
      hi: "चुने देश की मुद्रा में 12 महीनों की अग्रिम कीमत। आमतौर पर 12× मासिक से कम (Save पंक्ति देखें)।",
      ne: "चयनित देशको मुद्रामा १२ महिनाको अग्रिम मूल्य। सामान्यतः १२× मासिकभन्दा कम (Save पङ्क्ति हेर्नुहोस्)।",
    },
  },
  "price-save": {
    title: {
      en: "Save (yearly vs monthly)",
      hi: "बचत (वार्षिक बनाम मासिक)",
      ne: "बचत (वार्षिक बनाम मासिक)",
    },
    body: {
      en: "How much you save by paying yearly instead of 12 separate monthly payments (12× monthly − yearly). Green when there is a yearly discount.",
      hi: "12 अलग मासिक भुगतान के बजाय वार्षिक चुकाने पर कितनी बचत (12× मासिक − वार्षिक)। हरा रंग = वार्षिक छूट।",
      ne: "१२ छुट्टा मासिक भुक्तानीको सट्टा वार्षिक तिर्दा कति बचत (१२× मासिक − वार्षिक)। हरियो = वार्षिक छुट।",
    },
  },
  maxCompanies: {
    title: {
      en: "Max companies (online)",
      hi: "अधिकतम कंपनियाँ (ऑनलाइन)",
      ne: "अधिकतम कम्पनीहरू (अनलाइन)",
    },
    body: {
      en: `Per owner account: how many cloud-linked (Firestore) companies you may create. Online = storage not local. ${CAP_NOTE}`,
      hi: `प्रति मालिक खाता: कितनी क्लाउड-लिंक्ड (Firestore) कंपनियाँ बना सकते हैं। ऑनलाइन = स्टोरेज लोकल नहीं। ${CAP_NOTE}`,
      ne: `प्रति मालिक खाता: कति क्लाउड-लिङ्क (Firestore) कम्पनी बनाउन सकिन्छ। अनलाइन = स्टोरेज लोकल होइन। ${CAP_NOTE}`,
    },
  },
  maxCompaniesLocal: {
    title: {
      en: "Max companies (local)",
      hi: "अधिकतम कंपनियाँ (लोकल)",
      ne: "अधिकतम कम्पनीहरू (लोकल)",
    },
    body: {
      en: `Per owner account: how many device/SQLite-first (offline-first) companies you may create. ${CAP_NOTE}`,
      hi: `प्रति मालिक खाता: कितनी डिवाइस/SQLite (ऑफ़लाइन-फ़र्स्ट) कंपनियाँ बना सकते हैं। ${CAP_NOTE}`,
      ne: `प्रति मालिक खाता: कति यन्त्र/SQLite (अफलाइन-फर्स्ट) कम्पनी बनाउन सकिन्छ। ${CAP_NOTE}`,
    },
  },
  maxUsers: {
    title: {
      en: "Max users (online)",
      hi: "अधिकतम उपयोगकर्ता (ऑनलाइन)",
      ne: "अधिकतम प्रयोगकर्ता (अनलाइन)",
    },
    body: {
      en: `Per online company: owner + shared users allowed on a cloud-linked company. ${CAP_NOTE}`,
      hi: `प्रति ऑनलाइन कंपनी: क्लाउड कंपनी पर मालिक + साझा उपयोगकर्ता। ${CAP_NOTE}`,
      ne: `प्रति अनलाइन कम्पनी: क्लाउड कम्पनीमा मालिक + साझा प्रयोगकर्ता। ${CAP_NOTE}`,
    },
  },
  maxUsersLocal: {
    title: {
      en: "Max users (local)",
      hi: "अधिकतम उपयोगकर्ता (लोकल)",
      ne: "अधिकतम प्रयोगकर्ता (लोकल)",
    },
    body: {
      en: `Per local company: owner + shared / local-login users on a device-local company. ${CAP_NOTE}`,
      hi: `प्रति लोकल कंपनी: डिवाइस-लोकल कंपनी पर मालिक + साझा/लोकल-लॉगिन उपयोगकर्ता। ${CAP_NOTE}`,
      ne: `प्रति लोकल कम्पनी: यन्त्र-लोकल कम्पनीमा मालिक + साझा/लोकल-लगइन प्रयोगकर्ता। ${CAP_NOTE}`,
    },
  },
  maxDevices: {
    title: {
      en: "Max devices (online)",
      hi: "अधिकतम डिवाइस (ऑनलाइन)",
      ne: "अधिकतम यन्त्र (अनलाइन)",
    },
    body: {
      en: `Registered devices for an online company when Multi device sync is ON. If sync is OFF, effective limit is 1. ${CAP_NOTE}`,
      hi: `मल्टी डिवाइस सिंक ON होने पर ऑनलाइन कंपनी के पंजीकृत डिवाइस। सिंक OFF = प्रभावी सीमा 1। ${CAP_NOTE}`,
      ne: `मल्टि यन्त्र सिंक ON हुँदा अनलाइन कम्पनीका दर्ता यन्त्र। सिंक OFF = प्रभावकारी सीमा १। ${CAP_NOTE}`,
    },
  },
  hasMultiDeviceSync: {
    title: {
      en: "Multi device sync",
      hi: "मल्टी डिवाइस सिंक",
      ne: "मल्टि यन्त्र सिंक",
    },
    body: {
      en: "Yes = plan allows more than one registered device when Max devices > 1. No = forced single-device mode (limit 1).",
      hi: "हाँ = Max devices > 1 होने पर एक से अधिक पंजीकृत डिवाइस। नहीं = केवल एक डिवाइस (सीमा 1)।",
      ne: "हो = Max devices > १ हुँदा एकभन्दा बढी दर्ता यन्त्र। होइन = अनिवार्य एकल यन्त्र (सीमा १)।",
    },
  },
  maxDevicesLocal: {
    title: {
      en: "Max devices (local)",
      hi: "अधिकतम डिवाइस (लोकल)",
      ne: "अधिकतम यन्त्र (लोकल)",
    },
    body: {
      en: `Device slots for local/SQLite companies when Multi device sync is ON. ${CAP_NOTE}`,
      hi: `मल्टी डिवाइस सिंक ON होने पर लोकल/SQLite कंपनियों के डिवाइस स्लॉट। ${CAP_NOTE}`,
      ne: `मल्टि यन्त्र सिंक ON हुँदा लोकल/SQLite कम्पनीका यन्त्र स्लट। ${CAP_NOTE}`,
    },
  },
  dailyVoucherLimit: {
    title: {
      en: "Daily vouchers (online)",
      hi: "दैनिक वाउचर (ऑनलाइन)",
      ne: "दैनिक भाउचर (अनलाइन)",
    },
    body: {
      en: `New vouchers you may create per calendar day on an online company. ${CAP_NOTE}`,
      hi: `ऑनलाइन कंपनी पर प्रति कैलेंडर दिन बनाये जा सकने वाले नए वाउचर। ${CAP_NOTE}`,
      ne: `अनलाइन कम्पनीमा प्रति पात्रो दिन बनाउन सकिने नयाँ भाउचर। ${CAP_NOTE}`,
    },
  },
  dailyVoucherLimitLocal: {
    title: {
      en: "Daily vouchers (local)",
      hi: "दैनिक वाउचर (लोकल)",
      ne: "दैनिक भाउचर (लोकल)",
    },
    body: {
      en: `New vouchers per calendar day on a local/device company. ${CAP_NOTE}`,
      hi: `लोकल/डिवाइस कंपनी पर प्रति कैलेंडर दिन नए वाउचर। ${CAP_NOTE}`,
      ne: `लोकल/यन्त्र कम्पनीमा प्रति पात्रो दिन नयाँ भाउचर। ${CAP_NOTE}`,
    },
  },
  monthlyVoucherLimit: {
    title: {
      en: "Monthly vouchers (online)",
      hi: "मासिक वाउचर (ऑनलाइन)",
      ne: "मासिक भाउचर (अनलाइन)",
    },
    body: {
      en: `New vouchers per calendar month on an online company. ${CAP_NOTE}`,
      hi: `ऑनलाइन कंपनी पर प्रति कैलेंडर माह नए वाउचर। ${CAP_NOTE}`,
      ne: `अनलाइन कम्पनीमा प्रति पात्रो महिना नयाँ भाउचर। ${CAP_NOTE}`,
    },
  },
  monthlyVoucherLimitLocal: {
    title: {
      en: "Monthly vouchers (local)",
      hi: "मासिक वाउचर (लोकल)",
      ne: "मासिक भाउचर (लोकल)",
    },
    body: {
      en: `New vouchers per calendar month on a local company. ${CAP_NOTE}`,
      hi: `लोकल कंपनी पर प्रति कैलेंडर माह नए वाउचर। ${CAP_NOTE}`,
      ne: `लोकल कम्पनीमा प्रति पात्रो महिना नयाँ भाउचर। ${CAP_NOTE}`,
    },
  },
  maxAttachmentsGB: {
    title: {
      en: "Attachments GB (online)",
      hi: "अटैचमेंट GB (ऑनलाइन)",
      ne: "संलग्नक GB (अनलाइन)",
    },
    body: {
      en: `Total voucher/file attachment storage (GB) for online companies. ${CAP_NOTE}`,
      hi: `ऑनलाइन कंपनियों के लिए वाउचर/फ़ाइल अटैचमेंट संग्रहण (GB)। ${CAP_NOTE}`,
      ne: `अनलाइन कम्पनीका लागि भाउचर/फाइल संलग्नक भण्डारण (GB)। ${CAP_NOTE}`,
    },
  },
  maxAttachmentsGBLocal: {
    title: {
      en: "Attachments GB (local)",
      hi: "अटैचमेंट GB (लोकल)",
      ne: "संलग्नक GB (लोकल)",
    },
    body: {
      en: `Attachment storage (GB) for local companies. ${CAP_NOTE}`,
      hi: `लोकल कंपनियों के लिए अटैचमेंट संग्रहण (GB)। ${CAP_NOTE}`,
      ne: `लोकल कम्पनीका लागि संलग्नक भण्डारण (GB)। ${CAP_NOTE}`,
    },
  },
  maxStorageGB: {
    title: {
      en: "Storage GB (online)",
      hi: "स्टोरेज GB (ऑनलाइन)",
      ne: "भण्डारण GB (अनलाइन)",
    },
    body: {
      en: `Broader online company data/storage budget (GB), including attachments where counted. ${CAP_NOTE}`,
      hi: `ऑनलाइन कंपनी का व्यापक डेटा/स्टोरेज बजट (GB), जहाँ गिना जाता हो अटैचमेंट सहित। ${CAP_NOTE}`,
      ne: `अनलाइन कम्पनीको व्यापक डाटा/भण्डारण बजेट (GB), जहाँ गनिन्छ संलग्नक सहित। ${CAP_NOTE}`,
    },
  },
  maxStorageGBLocal: {
    title: {
      en: "Storage GB (local)",
      hi: "स्टोरेज GB (लोकल)",
      ne: "भण्डारण GB (लोकल)",
    },
    body: {
      en: `Storage budget (GB) for local companies. ${CAP_NOTE}`,
      hi: `लोकल कंपनियों का स्टोरेज बजट (GB)। ${CAP_NOTE}`,
      ne: `लोकल कम्पनीको भण्डारण बजेट (GB)। ${CAP_NOTE}`,
    },
  },
  maxAttachmentBackupPerMonth: {
    title: {
      en: "Attachment backups / month",
      hi: "अटैचमेंट बैकअप / माह",
      ne: "संलग्नक ब्याकअप / महिना",
    },
    body: {
      en: `How many times per calendar month the owner may run an attachment-heavy .plbp backup (files embedded). ${CAP_NOTE}`,
      hi: `प्रति कैलेंडर माह मालिक कितनी बार अटैचमेंट वाला .plbp बैकअप चला सकता है (फ़ाइलें एम्बेड)। ${CAP_NOTE}`,
      ne: `प्रति पात्रो महिना मालिक कति पटक संलग्नकयुक्त .plbp ब्याकअप चलाउन सक्छ (फाइल इम्बेड)। ${CAP_NOTE}`,
    },
  },
  maxAttachmentRestorePerMonth: {
    title: {
      en: "Attachment restores / month",
      hi: "अटैचमेंट रिस्टोर / माह",
      ne: "संलग्नक रिस्टोर / महिना",
    },
    body: {
      en: `How many times per month you may restore attachment bytes from a .plbp pack. ${CAP_NOTE}`,
      hi: `प्रति माह कितनी बार .plbp पैक से अटैचमेंट बाइट रिस्टोर कर सकते हैं। ${CAP_NOTE}`,
      ne: `प्रति महिना कति पटक .plbp प्याकबाट संलग्नक बाइट रिस्टोर गर्न सकिन्छ। ${CAP_NOTE}`,
    },
  },
  maxLocalToOnlineAttachmentMB: {
    title: {
      en: "Local→cloud attachments (MB)",
      hi: "लोकल→क्लाउड अटैचमेंट (MB)",
      ne: "लोकल→क्लाउड संलग्नक (MB)",
    },
    body: {
      en: `When uploading/linking a local company to cloud, max total size of attachments in that one-time upload (megabytes). None = attachments not allowed on that upload. ${CAP_NOTE}`,
      hi: `लोकल कंपनी को क्लाउड पर अपलोड/लिंक करते समय उस एक अपलोड में अटैचमेंट का अधिकतम कुल आकार (MB)। None = उस अपलोड पर अटैचमेंट नहीं। ${CAP_NOTE}`,
      ne: `लोकल कम्पनी क्लाउडमा अपलोड/लिंक गर्दा त्यो एकपटक अपलोडमा संलग्नकको अधिकतम कुल आकार (MB)। None = त्यो अपलोडमा संलग्नक अनुमति छैन। ${CAP_NOTE}`,
    },
  },
  hasRoleBasedAccess: {
    title: {
      en: "Role-based access",
      hi: "भूमिका-आधारित पहुँच",
      ne: "भूमिका-आधारित पहुँच",
    },
    body: {
      en: "Yes = plan includes role permissions for shared users (view/edit limits per role). No = that capability is not in this tier.",
      hi: "हाँ = साझा उपयोगकर्ताओं के लिए भूमिका अनुमतियाँ। नहीं = इस टियर में नहीं।",
      ne: "हो = साझा प्रयोगकर्ताका लागि भूमिका अनुमति। होइन = यस तहमा छैन।",
    },
  },
  hasAuditLogs: {
    title: {
      en: "Audit logs",
      hi: "ऑडिट लॉग",
      ne: "अडिट लग",
    },
    body: {
      en: "Yes = detailed change/activity logging features for the company. No = not included in this plan.",
      hi: "हाँ = कंपनी के लिए विस्तृत गतिविधि/परिवर्तन लॉग। नहीं = इस प्लान में नहीं।",
      ne: "हो = कम्पनीका लागि विस्तृत गतिविधि/परिवर्तन लग। होइन = यस योजनामा छैन।",
    },
  },
  hasPrioritySupport: {
    title: {
      en: "Priority support",
      hi: "प्राथमिकता सहायता",
      ne: "प्राथमिकता सहायता",
    },
    body: {
      en: "Yes = faster / priority customer support channel for this plan. No = standard support only.",
      hi: "हाँ = इस प्लान के लिए प्राथमिकता सहायता। नहीं = केवल सामान्य सहायता।",
      ne: "हो = यस योजनाका लागि प्राथमिकता सहायता। होइन = केवल सामान्य सहायता।",
    },
  },
  "term-action": {
    title: {
      en: "Term & action",
      hi: "अवधि और कार्रवाई",
      ne: "अवधि र कार्य",
    },
    body: {
      en: "Choose subscription term and pay, renew, or upgrade for that plan column. Downgrade / return to a lower paid tier appears only when the administrator allows paid-to-paid downgrades; after an upgrade with that policy off, lower paid columns stay locked (no Downgrade button). Buttons also depend on your current plan and remaining days.",
      hi: "उस प्लान कॉलम के लिए अवधि चुनें और भुगतान/नवीनीकरण/अपग्रेड करें। निचले सशुल्क स्तर पर डाउनग्रेड/वापसी तभी दिखती है जब प्रशासक ने सशुल्क→सशुल्क डाउनग्रेड चालू रखा हो; वह नीति बंद हो तो अपग्रेड के बाद निचले सशुल्क कॉलम लॉक रहते हैं (Downgrade बटन नहीं)। बटन आपके वर्तमान प्लान और शेष दिनों पर भी निर्भर करते हैं।",
      ne: "त्यो योजना स्तम्भका लागि अवधि छान्नुहोस् र भुक्तानी/नवीकरण/अपग्रेड गर्नुहोस्। तल्लो भुक्तान स्तरमा डाउनग्रेड/फर्कने त्यतिबेला मात्र देखिन्छ जब प्रशासकले भुक्तान→भुक्तान डाउनग्रेड अनुमति दिएको हुन्छ; त्यो नीति बन्द भए अपग्रेडपछि तल्ला भुक्तान स्तम्भ लक रहन्छन् (Downgrade बटन छैन)। बटन तपाईंको हालको योजना र बाँकी दिनमा पनि निर्भर गर्छ।",
    },
  },
};
