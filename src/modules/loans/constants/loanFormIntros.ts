export type LoanIntroLang = "en" | "hi" | "ne";

export type LoanIntroCopy = {
  title: string;
  paragraphs: string[];
};

export type LoanIntroSet = Record<LoanIntroLang, LoanIntroCopy>;

function intro(en: LoanIntroCopy, hi: LoanIntroCopy, ne: LoanIntroCopy): LoanIntroSet {
  return { en, hi, ne };
}

/** Full field + dropdown-option intros. Shown only inside the (i) dialog. Default language: English. */
export const LOAN_FORM_INTROS: Record<string, LoanIntroSet> = {
  form: intro(
    {
      title: "Create Loan Account — how this form works",
      paragraphs: [
        "This form creates a complete loan record for the currently selected company. It does not replace your Chart of Accounts or voucher books. After you save, Pocket Ledger stores the loan schedule in the Loan module and, if you choose, posts a real journal into the existing accounting system.",
        "Fill the sections in order: who the lender is, how much was borrowed, how interest and EMI are calculated, which dates apply, and which ledger accounts will receive Debit and Credit. Use Calculate Schedule before Save so you can see EMI, total interest, total repayment, and maturity date.",
        "Every field has an (i) icon. Click (i) to read a full explanation in English, हिन्दी, or नेपाली. When you choose a value in a dropdown, another (i) appears under that dropdown for the selected option. Help text is never placed as long paragraphs on the form itself — it stays inside (i).",
      ],
    },
    {
      title: "लोन खाता बनाएँ — यह फ़ॉर्म कैसे काम करता है",
      paragraphs: [
        "यह फ़ॉर्म वर्तमान चुनी हुई कंपनी के लिए पूरा लोन रिकॉर्ड बनाता है। यह आपके मौजूदा खाता-वर्गीकरण या वाउचर बही को बदलता नहीं है। सेव करने के बाद Pocket Ledger लोन शेड्यूल लोन मॉड्यूल में रखता है, और यदि आप चुनें तो मौजूदा अकाउंटिंग सिस्टम में असली जर्नल भी पोस्ट करता है।",
        "क्रम से भरें: ऋणदाता कौन है, कितना उधार लिया गया, ब्याज और EMI कैसे निकलेंगे, कौन-सी तिथियाँ लागू हैं, और डेबिट-क्रेडिट किन खातों में जाएगा। सेव से पहले Calculate Schedule दबाएँ ताकि EMI, कुल ब्याज, कुल चुकौती और परिपक्वता तिथि दिखे।",
        "हर फ़ील्ड पर (i) आइकन है। (i) पर क्लिक कर अंग्रेज़ी, हिन्दी या नेपाली में पूरी व्याख्या पढ़ें। ड्रॉपडाउन में विकल्प चुनने पर उस विकल्प की व्याख्या के लिए ड्रॉपडाउन के नीचे भी (i) आता है। लंबा परिचय फ़ॉर्म पर नहीं लिखा जाता — केवल (i) के अंदर रहता है।",
      ],
    },
    {
      title: "ऋण खाता बनाउनुहोस् — यो फारम कसरी काम गर्छ",
      paragraphs: [
        "यो फारमले हाल चयन गरिएको कम्पनीका लागि पूरा ऋण रेकर्ड बनाउँछ। यसले तपाईंको विद्यमान खाता वर्गीकरण वा भाउचर किताबलाई बदल्दैन। सेभ गरेपछि Pocket Ledger ले ऋण तालिका ऋण मोड्युलमा राख्छ, र तपाईंले रोजेमा विद्यमान लेखा प्रणालीमा वास्तविक जर्नल पनि पोस्ट गर्छ।",
        "क्रमशः भर्नुहोस्: ऋणदाता को हो, कति ऋण लिइयो, ब्याज र EMI कसरी निकालिन्छ, कुन मिति लागू हुन्छ, र डेबिट-क्रेडिट कुन खातामा जान्छ। सेभ गर्नुअघि Calculate Schedule थिच्नुहोस् ताकि EMI, कुल ब्याज, कुल भुक्तानी र परिपक्वता मिति देखियोस्।",
        "हरेक फिल्डमा (i) आइकन छ। (i) मा क्लिक गरी अंग्रेजी, हिन्दी वा नेपालीमा पूरा व्याख्या पढ्नुहोस्। ड्रपडाउनमा विकल्प रोजेपछि त्यो विकल्पको व्याख्याका लागि ड्रपडाउन मुनि पनि (i) आउँछ। लामो परिचय फारममा लेखिँदैन — केवल (i) भित्र रहन्छ।",
      ],
    }
  ),

  addExistingAccount: intro(
    {
      title: "Add Existing Account — convert a bank/cash account into a loan setup",
      paragraphs: [
        "Use this when the money already lives in one of your Bank or Cash ledgers, and you now want that ledger to drive a loan. Click Add Existing Account to see every Bank/Cash account of this company. Choose one, edit the loan name and lender name if needed, then Save.",
        "The Bank/Cash account is not deleted and is not turned into a liability ledger. That would break existing receipts, payments, and contra entries posted on that bank. Instead, Pocket Ledger keeps the same bank as the account that receives disbursement and pays EMI (Debit/Credit Bank), and it creates or reuses a Loans & Liabilities staff account as the true loan liability.",
        "After Save, this form is filled automatically: Loan Name, Lender, Bank/Cash Account, and Loan Liability Account. You still enter principal, interest, tenure, and dates, then Calculate Schedule and Save Loan. If that bank was converted before, the previously linked liability account is reused so duplicates are not created.",
      ],
    },
    {
      title: "Add Existing Account — मौजूदा बैंक/नकद खाते को लोन से जोड़ना",
      paragraphs: [
        "जब पैसा पहले से किसी बैंक या कैश खाते में है और अब उसी खाते से लोन चलाना है, तब यह बटन उपयोग करें। Add Existing Account दबाने पर इस कंपनी के सभी बैंक/नकद खाते दिखते हैं। एक चुनें, आवश्यकता हो तो लोन नाम और ऋणदाता नाम संपादित करें, फिर सेव करें।",
        "बैंक/नकद खाता मिटता नहीं और उसे देनदारी खाता बनाकर प्रकार नहीं बदला जाता। ऐसा करने से उस बैंक पर पहले पोस्ट हुई रसीद, भुगतान और कॉन्ट्रा टूट सकते हैं। Pocket Ledger उसी बैंक को डिस्बर्सल और EMI का खाता रखता है (बैंक डेबिट/क्रेडिट), और Loans & Liabilities के अंतर्गत स्टाफ देनदारी खाता बनाता या पुनः उपयोग करता है — वही असली लोन देनदारी है।",
        "सेव के बाद यह फ़ॉर्म अपने आप भर जाता है: लोन नाम, ऋणदाता, बैंक/नकद खाता और लोन देनदारी खाता। मूलधन, ब्याज, अवधि और तिथियाँ आपको भरनी हैं, फिर Calculate Schedule और Save Loan करें। यदि वह बैंक पहले कनवर्ट हो चुका है तो पुराना जुड़ा देनदारी खाता दोबारा इस्तेमाल होता है, डुप्लिकेट नहीं बनता।",
      ],
    },
    {
      title: "Add Existing Account — विद्यमान बैंक/नगद खातालाई ऋणसँग जोड्ने",
      paragraphs: [
        "जब पैसा पहिले नै कुनै बैंक वा नगद खातामा छ र अब सोही खाताबाट ऋण चलाउन चाहनुहुन्छ भने यो बटन प्रयोग गर्नुहोस्। Add Existing Account थिचेपछि यस कम्पनीका सबै बैंक/नगद खाता देखिन्छन्। एउटा छान्नुहोस्, आवश्यक भए ऋण नाम र ऋणदाता नाम सम्पादन गर्नुहोस्, अनि सेभ गर्नुहोस्।",
        "बैंक/नगद खाता मेटिँदैन र त्यसलाई दायित्व खाता बनाएर प्रकार परिवर्तन गरिँदैन। त्यसो गर्दा सो बैंकमा पहिले पोस्ट भएका रसिद, भुक्तानी र कन्ट्रा बिग्रन सक्छन्। Pocket Ledger सोही बैंकलाई डिस्बर्सल र EMI को खाता राख्छ (बैंक डेबिट/क्रेडिट), र Loans & Liabilities अन्तर्गत स्टाफ दायित्व खाता बनाउँछ वा पुनः प्रयोग गर्छ — त्यही वास्तविक ऋण दायित्व हो।",
        "सेभपछि यो फारम आफैं भरिन्छ: ऋण नाम, ऋणदाता, बैंक/नगद खाता र ऋण दायित्व खाता। सावा, ब्याज, अवधि र मिति तपाईंले भर्नुपर्छ, त्यसपछि Calculate Schedule र Save Loan गर्नुहोस्। यदि सो बैंक पहिले कन्भर्ट भइसकेको छ भने पुरानो जोडिएको दायित्व खाता पुनः प्रयोग हुन्छ, नक्कल बन्दैन।",
      ],
    }
  ),

  loanName: intro(
    {
      title: "Loan Name",
      paragraphs: [
        "Loan Name is the display title of this borrowing in lists, dashboard, schedule, and reports. It should be unique enough that staff can recognise it at a glance, for example “Nabil Bank Term Loan” or “Siddhartha Vehicle Loan 2026”.",
        "This name is also the default name used when Pocket Ledger auto-creates the loan liability ledger under Loans & Liabilities. If you later change only the loan name on an unposted draft, reports will follow the new name; posted journals keep the account that was used at posting time.",
        "Do not put the EMI amount or account number as the only name. Keep the lender and purpose in the name so the Staff ledger, journal narration, and Loan Overview stay easy to match.",
      ],
    },
    {
      title: "लोन नाम",
      paragraphs: [
        "लोन नाम सूची, डैशबोर्ड, शेड्यूल और रिपोर्ट में इस उधार का दिखने वाला शीर्षक है। इतना स्पष्ट रखें कि कर्मचारी एक नज़र में पहचान लें, जैसे “Nabil Bank Term Loan” या “Siddhartha Vehicle Loan 2026”।",
        "जब Pocket Ledger Loans & Liabilities के अंतर्गत देनदारी खाता अपने आप बनाता है, तो यही नाम डिफ़ॉल्ट खाता-नाम बनता है। बिना पोस्ट ड्राफ्ट पर नाम बदलने से रिपोर्ट नया नाम दिखाएगी; पहले पोस्ट हुए जर्नल उसी खाते पर रहेंगे जो पोस्ट के समय चुना गया था।",
        "केवल EMI राशि या खाता संख्या को नाम न बनाएँ। ऋणदाता और उद्देश्य नाम में रखें ताकि स्टाफ खाता, जर्नल विवरण और Loan Overview आसानी से मिलें।",
      ],
    },
    {
      title: "ऋण नाम",
      paragraphs: [
        "ऋण नाम सूची, ड्यासबोर्ड, तालिका र रिपोर्टमा यस ऋणको देखिने शीर्षक हो। यति स्पष्ट राख्नुहोस् कि कर्मचारीले एक नजरमा चिन्न सकून्, जस्तै “Nabil Bank Term Loan” वा “Siddhartha Vehicle Loan 2026”।",
        "Pocket Ledger ले Loans & Liabilities अन्तर्गत दायित्व खाता आफैं बनाउँदा यही नाम पूर्वनिर्धारित खाता-नाम हुन्छ। नपोस्ट ड्राफ्टमा नाम बदलियो भने रिपोर्टले नयाँ नाम देखाउँछ; पहिले पोस्ट भएका जर्नल पोस्ट हुँदाका खातामा नै रहन्छन्।",
        "EMI रकम वा खाता नम्बर मात्र नाम नबनाउनुहोस्। ऋणदाता र उद्देश्य नाममा राख्नुहोस् ताकि स्टाफ खाता, जर्नल विवरण र Loan Overview सजिलै मिलून्।",
      ],
    }
  ),

  loanNumber: intro(
    {
      title: "Loan Number",
      paragraphs: [
        "Loan Number is your internal reference, separate from the bank’s sanction number if you wish. If you leave it blank, Pocket Ledger assigns the next number in this company, for example LN-0001, LN-0002. Numbers are unique per company, not shared across companies.",
        "Use the bank sanction or facility number here if you want EMI receipts, cheque references, and audit history to match the bank statement. You can still type a different Reference Number later on each EMI payment.",
        "Do not reuse a number that already exists in this company. The save will be rejected to protect reports and journal links.",
      ],
    },
    {
      title: "लोन नंबर",
      paragraphs: [
        "लोन नंबर आपका आंतरिक संदर्भ है; चाहें तो बैंक के स्वीकृति नंबर से अलग रख सकते हैं। खाली छोड़ने पर Pocket Ledger इस कंपनी में अगला नंबर देता है, जैसे LN-0001, LN-0002। नंबर कंपनी के अंदर अद्वितीय होते हैं, दूसरी कंपनी से साझा नहीं।",
        "यदि EMI रसीद, चेक संदर्भ और ऑडिट को बैंक स्टेटमेंट से मिलाना है तो यहाँ बैंक का sanction/facility नंबर लिखें। बाद में हर EMI पर अलग Reference Number भी लिख सकते हैं।",
        "इसी कंपनी में पहले से मौजूद नंबर दोबारा न लिखें। रिपोर्ट और जर्नल लिंक बचाने के लिए सेव रद्द हो जाएगा।",
      ],
    },
    {
      title: "ऋण नम्बर",
      paragraphs: [
        "ऋण नम्बर तपाईंको आन्तरिक सन्दर्भ हो; बैंकको स्वीकृति नम्बरभन्दा फरक राख्न सकिन्छ। खाली छोडे Pocket Ledger ले यस कम्पनीमा अर्को नम्बर दिन्छ, जस्तै LN-0001, LN-0002। नम्बर कम्पनीभित्र मात्र अद्वितीय हुन्छ, अर्को कम्पनीसँग साझा हुँदैन।",
        "EMI रसिद, चेक सन्दर्भ र अडिटलाई बैंक स्टेटमेन्टसँग मिलाउन यहाँ बैंकको sanction/facility नम्बर लेख्नुहोस्। पछि प्रत्येक EMI मा छुट्टै Reference Number पनि लेख्न सकिन्छ।",
        "यसै कम्पनीमा पहिले भएको नम्बर फेरि नलेख्नुहोस्। रिपोर्ट र जर्नल लिंक जोगाउन सेभ अस्वीकार हुन्छ।",
      ],
    }
  ),

  lenderName: intro(
    {
      title: "Lender / Bank name",
      paragraphs: [
        "This is the name of the institution or person who gave the loan — the bank, finance company, cooperative, or individual. It appears on the dashboard, filters, and reports so you can group all loans from the same lender.",
        "It is not the same as Bank/Cash Account. Bank/Cash Account is YOUR ledger that holds money (for example Nabil Current). Lender Name is WHO you borrowed from (for example Nabil Bank Limited). One bank can have several of your current accounts; the lender name still stays the bank.",
        "If you converted an existing bank account, this field is filled from that account’s bank name or account name. You may still edit it before saving the loan.",
      ],
    },
    {
      title: "ऋणदाता / बैंक नाम",
      paragraphs: [
        "यह उस संस्था या व्यक्ति का नाम है जिसने ऋण दिया — बैंक, वित्त कंपनी, सहकारी या व्यक्ति। डैशबोर्ड, फ़िल्टर और रिपोर्ट में दिखता है ताकि एक ही ऋणदाता के सब लोन इकट्ठा देख सकें।",
        "यह Bank/Cash Account नहीं है। Bank/Cash Account आपका वह खाता है जिसमें पैसा रहता है (जैसे Nabil Current)। Lender Name वह है जिससे आपने उधार लिया (जैसे Nabil Bank Limited)। एक बैंक के कई चालू खाते हो सकते हैं; ऋणदाता नाम फिर भी बैंक ही रहता है।",
        "यदि आपने मौजूदा बैंक खाता कनवर्ट किया है तो यह फ़ील्ड उस खाते के बैंक नाम या खाता नाम से भर जाता है। लोन सेव करने से पहले संपादित कर सकते हैं।",
      ],
    },
    {
      title: "ऋणदाता / बैंक नाम",
      paragraphs: [
        "यो ऋण दिने संस्था वा व्यक्तिको नाम हो — बैंक, वित्त कम्पनी, सहकारी वा व्यक्ति। ड्यासबोर्ड, फिल्टर र रिपोर्टमा देखिन्छ ताकि एउटै ऋणदाताका सबै ऋण सँगै हेर्न सकियोस्।",
        "यो Bank/Cash Account होइन। Bank/Cash Account तपाईंको पैसा रहने खाता हो (जस्तै Nabil Current)। Lender Name त्यो हो जहाँबाट ऋण लिनुभयो (जस्तै Nabil Bank Limited)। एउटा बैंकका धेरै चालू खाता हुन सक्छन्; ऋणदाता नाम भने बैंक नै रहन्छ।",
        "विद्यमान बैंक खाता कन्भर्ट गर्नुभयो भने यो फिल्ड सो खाताको बैंक नाम वा खाता नामबाट भरिन्छ। ऋण सेभ गर्नुअघि सम्पादन गर्न सकिन्छ।",
      ],
    }
  ),

  lenderType: intro(
    {
      title: "Lender Type",
      paragraphs: [
        "Lender Type classifies who the creditor is for reports and filters. It does not change the journal accounts by itself. Choose Bank for commercial banks, NBFC for finance companies, Cooperative for savings-and-credit societies, Individual for a person, Government for official schemes, or Other.",
        "After you pick an option, click the (i) under the dropdown to read how that specific type is used. The accounting entries still follow the Bank/Cash and Loan Liability accounts you map below.",
      ],
    },
    {
      title: "ऋणदाता प्रकार",
      paragraphs: [
        "Lender Type रिपोर्ट और फ़िल्टर के लिए लेनदार का वर्ग बताता है। अकेले यह जर्नल खाते नहीं बदलता। वाणिज्यिक बैंक के लिए Bank, वित्त कंपनी के लिए NBFC, सहकारी के लिए Cooperative, व्यक्ति के लिए Individual, सरकारी योजना के लिए Government, अन्य के लिए Other चुनें।",
        "विकल्प चुनने के बाद ड्रॉपडाउन के नीचे (i) दबाकर उस प्रकार का उपयोग पढ़ें। हिसाब फिर भी नीचे मैप किए Bank/Cash और Loan Liability खातों के अनुसार ही चलेगा।",
      ],
    },
    {
      title: "ऋणदाता प्रकार",
      paragraphs: [
        "Lender Type रिपोर्ट र फिल्टरका लागि लेनदारको वर्ग हो। यसले एक्लै जर्नल खाता बदल्दैन। वाणिज्यिक बैंकका लागि Bank, वित्त कम्पनीका लागि NBFC, सहकारीका लागि Cooperative, व्यक्तिका लागि Individual, सरकारी योजनाका लागि Government, अन्यका लागि Other छान्नुहोस्।",
        "विकल्प रोजेपछि ड्रपडाउन मुनिको (i) थिचेर सो प्रकारको प्रयोग पढ्नुहोस्। हिसाब तल म्याप गरिएका Bank/Cash र Loan Liability खाताअनुसार नै चल्छ।",
      ],
    }
  ),

  loanType: intro(
    {
      title: "Loan Type",
      paragraphs: [
        "Loan Type describes the purpose or legal form of the facility: term, business, personal, vehicle, home, working capital, secured, unsecured, or other. It is stored on the loan master for reports and filters. It does not by itself change interest formula or EMI.",
        "If none of the listed types fit, choose Other and fill Custom Type. The schedule still follows Interest Method, rate, tenure, and frequency — not the type label.",
      ],
    },
    {
      title: "लोन प्रकार",
      paragraphs: [
        "लोन प्रकार सुविधा का उद्देश्य या रूप बताता है: सावधि, व्यापार, व्यक्तिगत, वाहन, आवास, कार्यशील पूँजी, जमानती, बिना जमानत, या अन्य। यह लोन मास्टर पर रिपोर्ट और फ़िल्टर के लिए संग्रहित होता है। अकेले यह ब्याज सूत्र या EMI नहीं बदलता।",
        "सूची में न हो तो Other चुनकर Custom Type भरें। शेड्यूल फिर भी Interest Method, दर, अवधि और आवृत्ति से बनेगा — प्रकार के लेबल से नहीं।",
      ],
    },
    {
      title: "ऋण प्रकार",
      paragraphs: [
        "ऋण प्रकार सुविघाको उद्देश्य वा रूप हो: सावधि, व्यापार, व्यक्तिगत, सवारी, आवास, चालु पुँजी, धितो, बिना धितो, वा अन्य। यो ऋण मास्टरमा रिपोर्ट र फिल्टरका लागि राखिन्छ। यसले एक्लै ब्याज सूत्र वा EMI बदल्दैन।",
        "सूचीमा नपरे Other छानी Custom Type भर्नुहोस्। तालिका Interest Method, दर, अवधि र आवृत्तिबाट बन्छ — प्रकारको लेबलबाट होइन।",
      ],
    }
  ),

  customLoanType: intro(
    {
      title: "Custom loan type",
      paragraphs: [
        "When Loan Type is Other, write the exact description you use in your books, for example “Machinery hypothecation” or “Director loan”. This text is saved as the loan type on reports.",
        "Keep it short enough for tables but clear enough for audit. It does not create a new Chart of Accounts group by itself.",
      ],
    },
    {
      title: "कस्टम लोन प्रकार",
      paragraphs: [
        "जब लोन प्रकार Other हो, अपनी बहियों वाला वर्णन लिखें, जैसे “Machinery hypothecation” या “Director loan”। यही पाठ रिपोर्ट में लोन प्रकार के रूप में सहेजा जाता है।",
        "तालिका के लिए छोटा और ऑडिट के लिए स्पष्ट रखें। अकेले यह खाता-वर्गीकरण में नया समूह नहीं बनाता।",
      ],
    },
    {
      title: "कस्टम ऋण प्रकार",
      paragraphs: [
        "ऋण प्रकार Other हुँदा आफ्नो खातामा प्रयोग हुने वर्णन लेख्नुहोस्, जस्तै “Machinery hypothecation” वा “Director loan”। यही पाठ रिपोर्टमा ऋण प्रकारका रूपमा सेभ हुन्छ।",
        "तालिकाका लागि छोटो र अडिटका लागि स्पष्ट राख्नुहोस्। यसले एक्लै खाता वर्गीकरणमा नयाँ समूह बनाउँदैन।",
      ],
    }
  ),

  loanPurpose: intro(
    {
      title: "Purpose",
      paragraphs: [
        "Purpose is a free note of why the money was borrowed — working capital, vehicle, building, refinancing, and so on. It is stored on the loan and shown on the overview. It is not posted as a journal narration unless you copy it into Notes or into a charge.",
        "Write enough that another user next year understands the facility without opening the bank sanction letter.",
      ],
    },
    {
      title: "उद्देश्य",
      paragraphs: [
        "उद्देश्य बताता है कि पैसा क्यों उधार लिया गया — कार्यशील पूँजी, वाहन, भवन, पुनर्वित्त आदि। यह लोन पर संग्रहित होता है और अवलोकन पर दिखता है। जब तक आप इसे Notes या शुल्क में न लिखें, यह जर्नल विवरण नहीं बनता।",
        "इतना लिखें कि अगले वर्ष दूसरा उपयोगकर्ता बैंक स्वीकृति पत्र खोले बिना सुविधा समझ ले।",
      ],
    },
    {
      title: "उद्देश्य",
      paragraphs: [
        "उद्देश्यले पैसा किन ऋण लिइयो भन्ने बताउँछ — चालु पुँजी, सवारी, भवन, पुनर्वित्त आदि। यो ऋणमा राखिन्छ र अवलोकनमा देखिन्छ। Notes वा शुल्कमा नलेखेसम्म जर्नल विवरण बन्दैन।",
        "यति लेख्नुहोस् कि अर्को वर्ष अर्को प्रयोगकर्ताले बैंक स्वीकृति पत्र नखोली सुविघा बुझोस्।",
      ],
    }
  ),

  principalAmount: intro(
    {
      title: "Principal Amount",
      paragraphs: [
        "Principal is the sanctioned loan amount — the original face value of the facility. It must be greater than zero. This figure is used on the dashboard as Total Borrowed and as the starting outstanding if Disbursed Amount is left equal to it.",
        "Principal is a liability, not income. When disbursement is posted, the journal is Debit Bank/Cash and Credit Loan Liability for the disbursed sum. Principal is reduced later only when you post EMI or prepayment that includes a principal portion.",
        "Do not type a negative number. Do not put interest inside principal. Interest is calculated separately from Interest Rate and Interest Method.",
      ],
    },
    {
      title: "मूलधन (Principal)",
      paragraphs: [
        "मूलधन स्वीकृत लोन राशि है — सुविधा का मूल अंकित मूल्य। शून्य से अधिक होना चाहिए। डैशबोर्ड पर Total Borrowed इसी से बनता है, और यदि Disbursed Amount इसके बराबर है तो यही प्रारंभिक बकाया भी है।",
        "मूलधन देनदारी है, आय नहीं। डिस्बर्सल पोस्ट होने पर जर्नल होता है: डेबिट बैंक/नकद, क्रेडिट लोन देनदारी — वितरित राशि के लिए। मूलधन बाद में केवल तभी घटता है जब EMI या पूर्वभुगतान में मूलधन हिस्सा पोस्ट हो।",
        "ऋणात्मक संख्या न लिखें। ब्याज को मूलधन में न मिलाएँ। ब्याज Interest Rate और Interest Method से अलग निकलता है।",
      ],
    },
    {
      title: "सावा (Principal)",
      paragraphs: [
        "सावा स्वीकृत ऋण रकम हो — सुविघाको मूल अंकित मूल्य। शून्यभन्दा ठूलो हुनुपर्छ। ड्यासबोर्डको Total Borrowed यसैबाट बन्छ, र Disbursed Amount यसैबरबर छ भने यही सुरुको बाँकी पनि हो।",
        "सावा दायित्व हो, आम्दानी होइन। डिस्बर्सल पोस्ट हुँदा जर्नल हुन्छ: डेबिट बैंक/नगद, क्रेडिट ऋण दायित्व — वितरित रकमका लागि। सावा पछि मात्र घट्छ जब EMI वा अग्रिम भुक्तानीमा सावा हिस्सा पोस्ट हुन्छ।",
        "ऋणात्मक संख्या नलेख्नुहोस्। ब्याज सावामा नमिसाउनुहोस्। ब्याज Interest Rate र Interest Method बाट छुट्टै निस्कन्छ।",
      ],
    }
  ),

  disbursedAmount: intro(
    {
      title: "Disbursed Amount",
      paragraphs: [
        "Disbursed Amount is the money actually credited to your Bank/Cash. It may equal Principal, or be less if the bank released the facility in part. It cannot exceed Principal and cannot be negative.",
        "The repayment schedule and outstanding principal start from Disbursed Amount, not from a higher sanctioned figure that never entered the bank. If the bank later releases another tranche, record that as a separate loan or as an additional disbursement process — this form posts one disbursement journal for this amount when that option is on.",
        "If you leave it blank or zero, Pocket Ledger copies Principal into Disbursed when you first type Principal, so a fully drawn loan needs only one amount.",
      ],
    },
    {
      title: "वितरित राशि (Disbursed)",
      paragraphs: [
        "Disbursed Amount वह धन है जो वास्तव में आपके बैंक/नकद में आया। यह मूलधन के बराबर हो सकता है, या आंशिक जारी होने पर कम। मूलधन से अधिक या ऋणात्मक नहीं हो सकता।",
        "चुकौती शेड्यूल और बकाया मूलधन Disbursed Amount से शुरू होते हैं, उस ऊँची स्वीकृत राशि से नहीं जो बैंक में आई ही नहीं। बाद में दूसरी किस्त आए तो अलग लोन या अतिरिक्त डिस्बर्सल से दर्ज करें — यह फ़ॉर्म चालू विकल्प पर इसी राशि का एक डिस्बर्सल जर्नल पोस्ट करता है।",
        "खाली या शून्य छोड़ने पर पहली बार मूलधन लिखते ही Pocket Ledger उसे Disbursed में कॉपी करता है, ताकि पूरी निकासी वाले लोन में एक ही राशि काफी हो।",
      ],
    },
    {
      title: "वितरित रकम (Disbursed)",
      paragraphs: [
        "Disbursed Amount त्यो पैसा हो जो वास्तवमा तपाईंको बैंक/नगदमा आयो। सावा बराबर हुन सक्छ, वा आंशिक जारी भए कम। सावाभन्दा बढी वा ऋणात्मक हुन सक्दैन।",
        "भुक्तानी तालिका र बाँकी सावा Disbursed Amount बाट सुरु हुन्छ, बैंकमा नआएको ठूलो स्वीकृत अंकबाट होइन। पछि अर्को किस्ता आए अलग ऋण वा थप डिस्बर्सलबाट लेख्नुहोस् — यो फारम विकल्प खुला हुँदा यही रकमको एक डिस्बर्सल जर्नल पोस्ट गर्छ।",
        "खाली वा शून्य छोडे पहिलो पटक सावा लेख्दा Pocket Ledger ले Disbursed मा कपी गर्छ, ताकि पूर्ण निकासी ऋणमा एउटै रकम पुगोस्।",
      ],
    }
  ),

  interestMethod: intro(
    {
      title: "Interest Method",
      paragraphs: [
        "Interest Method is the mathematical rule used to split each installment into principal and interest. It is the most important calculation choice on this form. Reducing Balance is the usual method for bank EMI loans: interest each period is outstanding principal times the periodic rate, then EMI minus interest is principal.",
        "Flat Rate and Simple Interest use the original principal for interest, so early installments contain more interest than reducing balance for the same headline rate. Compound Interest adds interest to the balance before the payment. Daily Reducing uses actual days between dates and the Day Basis (365, 366, or 360).",
        "Changing the method after you Calculate Schedule rebuilds the preview. After the loan is saved and journals are posted, a method change is not applied to old posted rows; only a new future schedule would be generated by dedicated actions such as rate change or prepayment.",
      ],
    },
    {
      title: "ब्याज विधि",
      paragraphs: [
        "Interest Method वह गणित नियम है जिससे हर किस्त मूलधन और ब्याज में बँटती है। यह फ़ॉर्म का सबसे महत्वपूर्ण गणना विकल्प है। Reducing Balance बैंक EMI का सामान्य तरीका है: हर अवधि में ब्याज = बकाया मूलधन × आवधिक दर, फिर EMI में से ब्याज घटाने पर मूलधन।",
        "Flat Rate और Simple Interest ब्याज मूल मूलधन पर लगाते हैं, इसलिए उसी अंकित दर पर शुरुआती किस्तों में Reducing से अधिक ब्याज होता है। Compound Interest भुगतान से पहले ब्याज शेष में जोड़ता है। Daily Reducing तिथियों के बीच के वास्तविक दिन और Day Basis (365, 366 या 360) से चलता है।",
        "Calculate Schedule के बाद विधि बदलने पर पूर्वावलोकन फिर बनता है। लोन सेव और जर्नल पोस्ट हो चुके हों तो पुरानी पोस्ट पंक्तियाँ नहीं बदलतीं; भविष्य का शेड्यूल दर परिवर्तन या पूर्वभुगतान जैसी क्रियाओं से ही नया बनता है।",
      ],
    },
    {
      title: "ब्याज विधि",
      paragraphs: [
        "Interest Method त्यो गणितीय नियम हो जसले प्रत्येक किस्तालाई सावा र ब्याजमा बाँड्छ। यो फारमको सबैभन्दा महत्वपूर्ण गणना विकल्प हो। Reducing Balance बैंक EMI को सामान्य तरिका हो: प्रत्येक अवधिमा ब्याज = बाँकी सावा × आवधिक दर, अनि EMI बाट ब्याज घटाएपछि सावा।",
        "Flat Rate र Simple Interest ले मूल सावामा ब्याज लगाउँछन्, त्यसैले उही अंकित दरमा सुरुका किस्तामा Reducing भन्दा बढी ब्याज हुन्छ। Compound Interest ले भुक्तानीअघि ब्याज मौज्दातमा जोड्छ। Daily Reducing ले मितिबीचका वास्तविक दिन र Day Basis (365, 366 वा 360) प्रयोग गर्छ।",
        "Calculate Schedule पछि विधि बदलियो भने पूर्वावलोकन फेरि बन्छ। ऋण सेभ र जर्नल पोस्ट भइसकेपछि पुराना पोस्ट पङ्क्ति बदलिँदैनन्; भविष्यको तालिका दर परिवर्तन वा अग्रिम भुक्तानी जस्ता कार्यबाट मात्र नयाँ बन्छ।",
      ],
    }
  ),

  interestRate: intro(
    {
      title: "Interest Rate (% per year)",
      paragraphs: [
        "Enter the annual percentage rate the lender charges, for example 10.50 for ten and a half percent per year. Zero is allowed (interest-free) but negative is not. The program converts this annual rate into a periodic rate using Payment Frequency (monthly rate = annual / 12, and so on).",
        "This is not EMI and not the rupee interest of one installment. EMI is calculated from principal, this rate, method, and number of installments. Each schedule row then shows the rupee interest for that due date.",
        "For floating loans, this is the rate in force from disbursement until you use Change Interest Rate. Historical posted journals are never rewritten when the rate changes later.",
      ],
    },
    {
      title: "ब्याज दर (प्रति वर्ष %)",
      paragraphs: [
        "ऋणदाता की वार्षिक प्रतिशत दर लिखें, जैसे 10.50 का अर्थ साढ़े दस प्रतिशत प्रति वर्ष। शून्य चल सकता है (बिना ब्याज), ऋणात्मक नहीं। कार्यक्रम Payment Frequency से इसे आवधिक दर बनाता है (मासिक दर = वार्षिक / 12, इत्यादि)।",
        "यह EMI नहीं है और न एक किस्त का रुपया ब्याज। EMI मूलधन, इस दर, विधि और किस्त संख्या से निकलती है। फिर हर शेड्यूल पंक्ति उस देय तिथि का रुपया ब्याज दिखाती है।",
        "फ्लोटिंग लोन पर यह दर डिस्बर्सल से लेकर Change Interest Rate तक लागू रहती है। बाद में दर बदलने पर पुराने पोस्ट जर्नल नहीं लिखे जाते।",
      ],
    },
    {
      title: "ब्याज दर (प्रति वर्ष %)",
      paragraphs: [
        "ऋणदाताको वार्षिक प्रतिशत दर लेख्नुहोस्, जस्तै 10.50 को अर्थ साढे दश प्रतिशत प्रति वर्ष। शून्य चल्छ (ब्याजविहीन), ऋणात्मक चल्दैन। कार्यक्रमले Payment Frequency बाट आवधिक दर बनाउँछ (मासिक दर = वार्षिक / 12, आदि)।",
        "यो EMI होइन र एक किस्ताको रुपैयाँ ब्याज पनि होइन। EMI सावा, यो दर, विधि र किस्ता संख्याबाट निस्कन्छ। त्यसपछि प्रत्येक तालिका पङ्क्तिले सो देय मितिको रुपैयाँ ब्याज देखाउँछ।",
        "फ्लोटिङ ऋणमा यो दर डिस्बर्सलदेखि Change Interest Rate सम्म लागू रहन्छ। पछि दर बदलिए पुराना पोस्ट जर्नल दोहोर्याएर लेखिँदैनन्।",
      ],
    }
  ),

  interestRateType: intro(
    {
      title: "Interest Rate Type — Fixed or Floating",
      paragraphs: [
        "Fixed means this rate stays until a person manually uses Change Interest Rate. Floating means you expect the rate to change over the life of the loan; Pocket Ledger still stores a history of each change with effective date and reason.",
        "Neither option rewrites old EMI journals. Only unpaid future installments are recalculated when a new rate is saved. Choose Fixed if the sanction letter locks the rate; choose Floating if the bank revises with base rate or premium.",
      ],
    },
    {
      title: "ब्याज दर प्रकार — निश्चित या परिवर्तनशील",
      paragraphs: [
        "Fixed का अर्थ है दर तब तक वही रहेगी जब तक कोई Change Interest Rate से न बदले। Floating का अर्थ है लोन अवधि में दर बदलने की अपेक्षा; Pocket Ledger हर बदलाव की तिथि और कारण के साथ इतिहास रखता है।",
        "कोई भी विकल्प पुराने EMI जर्नल नहीं लिखता। नई दर सेव होने पर केवल अवैतनिक भविष्य की किस्तें फिर बनती हैं। स्वीकृति पत्र दर बाँधता हो तो Fixed, बैंक आधार दर से संशोधित करे तो Floating चुनें।",
      ],
    },
    {
      title: "ब्याज दर प्रकार — स्थिर वा परिवर्तनशील",
      paragraphs: [
        "Fixed को अर्थ दर तबसम्म उही रहन्छ जबसम्म कसैले Change Interest Rate बाट बदल्दैन। Floating को अर्थ ऋण अवधिमा दर बदलिने अपेक्षा; Pocket Ledger प्रत्येक परिवर्तनको मिति र कारणसहित इतिहास राख्छ।",
        "कुनै विकल्पले पुराना EMI जर्नल लेख्दैन। नयाँ दर सेभ हुँदा केवल नतिरेका भविष्यका किस्ता मात्र फेरि बन्छन्। स्वीकृति पत्रले दर बाँधे Fixed, बैंकले आधार दरबाट संशोधन गरे Floating छान्नुहोस्।",
      ],
    }
  ),

  tenure: intro(
    {
      title: "Tenure",
      paragraphs: [
        "Tenure is how long the loan will run, as a number of months or years according to Tenure Unit. Combined with Payment Frequency it produces the count of installments. Example: 60 with unit Months and monthly frequency gives 60 EMIs.",
        "Tenure must be greater than zero. If you later prepay and choose Reduce Tenure, remaining months shrink and a new future schedule is built; posted installments stay as history.",
      ],
    },
    {
      title: "अवधि (Tenure)",
      paragraphs: [
        "Tenure लोन कितने समय चलेगा, Tenure Unit के अनुसार महीनों या वर्षों की संख्या। Payment Frequency के साथ मिलकर किस्त संख्या बनती है। उदाहरण: 60 और इकाई Months, मासिक आवृत्ति = 60 EMI।",
        "Tenure शून्य से अधिक होना चाहिए। बाद में पूर्वभुगतान कर Reduce Tenure चुनने पर शेष महीने घटते हैं और भविष्य का नया शेड्यूल बनता है; पोस्ट हुई किस्तें इतिहास में रहती हैं।",
      ],
    },
    {
      title: "अवधि (Tenure)",
      paragraphs: [
        "Tenure ऋण कति समय चल्छ, Tenure Unit अनुसार महिना वा वर्षको संख्या। Payment Frequency सँग मिलेर किस्ता संख्या बन्छ। उदाहरण: 60 र इकाई Months, मासिक आवृत्ति = 60 EMI।",
        "Tenure शून्यभन्दा ठूलो हुनुपर्छ। पछि अग्रिम भुक्तानी गरी Reduce Tenure रोजे बाँकी महिना घट्छन् र भविष्यको नयाँ तालिका बन्छ; पोस्ट भएका किस्ता इतिहासमा रहन्छन्।",
      ],
    }
  ),

  tenureUnit: intro(
    {
      title: "Tenure Unit",
      paragraphs: [
        "Choose Months or Years for the Tenure number. 5 Years is the same length as 60 Months. The installment count still depends on Payment Frequency: 5 years monthly is 60 payments; 5 years quarterly is 20 payments.",
        "Use Months when the sanction letter states EMIs in months. Use Years for long facilities described only in years. After you pick a unit, the (i) under the dropdown explains that unit.",
      ],
    },
    {
      title: "अवधि इकाई",
      paragraphs: [
        "Tenure संख्या के लिए Months या Years चुनें। 5 Years और 60 Months एक ही लंबाई हैं। किस्त संख्या फिर भी Payment Frequency पर निर्भर है: 5 वर्ष मासिक = 60 भुगतान; 5 वर्ष तिमाही = 20 भुगतान।",
        "स्वीकृति पत्र में EMI महीने में हो तो Months, केवल वर्षों में हो तो Years। इकाई चुनने के बाद ड्रॉपडाउन के नीचे (i) उस इकाई को समझाता है।",
      ],
    },
    {
      title: "अवधि इकाई",
      paragraphs: [
        "Tenure संख्याका लागि Months वा Years छान्नुहोस्। 5 Years र 60 Months एउटै लम्बाइ हुन्। किस्ता संख्या भने Payment Frequency मा भर पर्छ: ५ वर्ष मासिक = ६० भुक्तानी; ५ वर्ष त्रैमासिक = २० भुक्तानी।",
        "स्वीकृति पत्रमा EMI महिनामा छ भने Months, केवल वर्षमा छ भने Years। इकाई रोजेपछि ड्रपडाउन मुनिको (i) ले सो इकाई बुझाउँछ।",
      ],
    }
  ),

  paymentFrequency: intro(
    {
      title: "Payment Frequency",
      paragraphs: [
        "Payment Frequency is how often an installment falls due: monthly, quarterly, half-yearly, yearly, or a custom interval in months. Due dates are generated automatically from First Payment Date plus this interval. You do not type every EMI date.",
        "Frequency also sets the periodic interest rate (annual rate divided by payments per year). Monthly is standard for retail and SME bank loans. After you select a value, use the (i) under the dropdown for that option.",
      ],
    },
    {
      title: "भुगतान आवृत्ति",
      paragraphs: [
        "Payment Frequency बताती है कि किस्त कितनी बार देय होगी: मासिक, तिमाही, अर्धवार्षिक, वार्षिक, या कस्टम महीनों का अंतराल। देय तिथियाँ First Payment Date और इस अंतराल से अपने आप बनती हैं। हर EMI तिथि हाथ से नहीं लिखनी।",
        "आवृत्ति आवधिक ब्याज दर भी तय करती है (वार्षिक दर ÷ वर्ष में भुगतान)। खुदरा और SME बैंक लोन के लिए मासिक सामान्य है। मान चुनने के बाद ड्रॉपडाउन के नीचे (i) उस विकल्प को समझाता है।",
      ],
    },
    {
      title: "भुक्तानी आवृत्ति",
      paragraphs: [
        "Payment Frequency ले किस्ता कति पटक देय हुन्छ भन्ने बताउँछ: मासिक, त्रैमासिक, अर्धवार्षिक, वार्षिक, वा कस्टम महिनाको अन्तराल। देय मिति First Payment Date र यो अन्तरालबाट आफैं बन्छन्। हरेक EMI मिति हातले लेख्नु पर्दैन।",
        "आवृत्तिले आवधिक ब्याज दर पनि तोक्छ (वार्षिक दर ÷ वर्षमा भुक्तानी)। खुद्रा र SME बैंक ऋणका लागि मासिक सामान्य हो। मान रोजेपछि ड्रपडाउन मुनिको (i) ले सो विकल्प बुझाउँछ।",
      ],
    }
  ),

  repaymentType: intro(
    {
      title: "Repayment Type",
      paragraphs: [
        "Choose how principal is repaid over the loan life. EMI spreads principal and interest in every installment (standard term loans). Interest Only charges only interest each period — principal stays outstanding until you post a Prepayment or close the loan (typical for Overdraft / Cash Credit). Bullet charges interest each period and the full principal on the final due date.",
        "For Interest Only and Bullet, Pocket Ledger hides the manual EMI box because the installment amount is derived from outstanding principal and rate. Use Prepayment to reduce principal on OD/CC loans; the next interest installments recalculate automatically.",
      ],
    },
    {
      title: "चुकौती प्रकार",
      paragraphs: [
        "चुनें कि मूलधन कैसे चुकाया जाए। EMI में हर किस्त में मूलधन और ब्याज दोनों जाते हैं (सामान्य टर्म लोन)। Interest Only में हर अवधि केवल ब्याज — मूलधन Prepayment या बंद करने तक बकाया रहता है (OD/CC)। Bullet में हर अवधि ब्याज और अंतिम तिथि पर पूरा मूलधन।",
        "Interest Only और Bullet पर मैन्युअल EMI छिपा रहता है क्योंकि किस्त बकाया और दर से निकलती है। OD/CC पर Prepayment से मूलधन घटाएँ; अगली ब्याज किस्तें अपने आप पुनर्गणना होंगी।",
      ],
    },
    {
      title: "भुक्तानी प्रकार",
      paragraphs: [
        "मूलधन कसरी फिर्ता हुन्छ छान्नुहोस्। EMI मा हरेक किस्तामा मूलधन र ब्याज दुवै जान्छ (सामान्य टर्म ऋण)। Interest Only मा प्रत्येक अवधिमा ब्याज मात्र — मूलधन Prepayment वा बन्द नगरेसम्म बाँकी रहन्छ (OD/CC)। Bullet मा प्रत्येक अवधिमा ब्याज र अन्तिम मितिमा पूरै मूलधन।",
        "Interest Only र Bullet मा म्यानुअल EMI लुकाइन्छ किनभने किस्त बाँकी र दरबाट निकालिन्छ। OD/CC मा Prepayment ले मूलधन घटाउनुहोस्; अर्को ब्याज किस्ता आफैं पुनर्गणना हुन्छ।",
      ],
    }
  ),

  emiAmount: intro(
    {
      title: "EMI amount",
      paragraphs: [
        "Leave this 0 (or empty) to let Pocket Ledger calculate EMI from principal, rate, method, tenure, and frequency. For reducing-balance loans the formula is P × r × (1+r)^n / ((1+r)^n − 1), then rounded with the same money rounding as the rest of the books.",
        "If you type a positive EMI, it is treated as a manual EMI. The schedule is built from that installment size and the last row is adjusted so outstanding principal finishes at zero. Manual EMI that is smaller than periodic interest cannot repay the loan — raise EMI or tenure.",
        "EMI on screen is a preview until you Calculate Schedule and Save. After save, changing EMI on this form is not applied to posted rows; use Prepayment (reduce EMI) for a new future schedule.",
      ],
    },
    {
      title: "EMI राशि",
      paragraphs: [
        "0 या खाली छोड़ें तो Pocket Ledger मूलधन, दर, विधि, अवधि और आवृत्ति से EMI निकालेगा। Reducing balance पर सूत्र P × r × (1+r)^n / ((1+r)^n − 1) है, फिर बाकी बहियों जैसा धन पूर्णांक।",
        "धनात्मक EMI लिखने पर वह मैन्युअल EMI मानी जाती है। शेड्यूल उसी किस्त आकार से बनता है और अंतिम पंक्ति समायोजित होती है ताकि बकाया मूलधन शून्य हो। आवधिक ब्याज से छोटी मैन्युअल EMI लोन चुका नहीं सकती — EMI या अवधि बढ़ाएँ।",
        "स्क्रीन की EMI पूर्वावलोकन है जब तक Calculate Schedule और Save न हो। सेव के बाद इस फ़ॉर्म से EMI बदलने पर पोस्ट पंक्तियाँ नहीं बदलतीं; भविष्य के शेड्यूल के लिए Prepayment (EMI घटाएँ) उपयोग करें।",
      ],
    },
    {
      title: "EMI रकम",
      paragraphs: [
        "0 वा खाली छोडे Pocket Ledger ले सावा, दर, विधि, अवधि र आवृत्तिबाट EMI निकाल्छ। Reducing balance मा सूत्र P × r × (1+r)^n / ((1+r)^n − 1) हो, त्यसपछि बाँकी खाताजस्तै रकम पूर्णांक।",
        "धनात्मक EMI लेखे त्यो म्यानुअल EMI मानिन्छ। तालिका सो किस्ता आकारबाट बन्छ र अन्तिम पङ्क्ति समायोजन हुन्छ ताकि बाँकी सावा शून्य होस्। आवधिक ब्याजभन्दा सानो म्यानुअल EMI ले ऋण चुक्ता गर्दैन — EMI वा अवधि बढाउनुहोस्।",
        "स्क्रिनको EMI पूर्वावलोकन हो जबसम्म Calculate Schedule र Save हुँदैन। सेभपछि यो फारमबाट EMI बदलदा पोस्ट पङ्क्ति बदलिँदैनन्; भविष्यको तालिकाका लागि Prepayment (EMI घटाउने) प्रयोग गर्नुहोस्।",
      ],
    }
  ),

  disbursementDate: intro(
    {
      title: "Disbursement Date",
      paragraphs: [
        "This is the calendar date the money entered (or will enter) your Bank/Cash. The disbursement journal uses this date as the voucher date. It is not the first EMI date.",
        "First Payment Date cannot be before this date. For daily reducing interest, days from disbursement to first EMI are used for the first interest amount.",
        "Dates are stored as local calendar days (year-month-day) so timezone conversion does not shift the day.",
      ],
    },
    {
      title: "वितरण तिथि (Disbursement)",
      paragraphs: [
        "वह कैलेंडर तिथि जब पैसा आपके बैंक/नकद में आया या आएगा। डिस्बर्सल जर्नल की वाउचर तिथि यही है। यह पहली EMI तिथि नहीं है।",
        "First Payment Date इससे पहले नहीं हो सकती। Daily reducing पर डिस्बर्सल से पहली EMI तक के दिन पहले ब्याज के लिए लगते हैं।",
        "तिथियाँ स्थानीय कैलेंडर दिन (वर्ष-माह-दिन) के रूप में सुरक्षित रहती हैं ताकि समय-क्षेत्र से दिन न खिसके।",
      ],
    },
    {
      title: "वितरण मिति (Disbursement)",
      paragraphs: [
        "त्यो पात्रो मिति जब पैसा तपाईंको बैंक/नगदमा आयो वा आउनेछ। डिस्बर्सल जर्नलको भाउचर मिति यही हो। यो पहिलो EMI मिति होइन।",
        "First Payment Date योभन्दा अघि हुन सक्दैन। Daily reducing मा डिस्बर्सलदेखि पहिलो EMI सम्मका दिन पहिलो ब्याजका लागि लाग्छन्।",
        "मिति स्थानीय पात्रो दिन (वर्ष-महिना-दिन) का रूपमा राखिन्छ ताकि समयक्षेत्रले दिन नसारोस्।",
      ],
    }
  ),

  firstPaymentDate: intro(
    {
      title: "First Payment Date",
      paragraphs: [
        "This is the due date of installment number 1. All later due dates are generated from this date plus Payment Frequency (and Payment Day rules). Example: first EMI 1 Sep 2026 monthly → 1 Oct, 1 Nov, and so on, with February and month-end clamped correctly.",
        "Due date is not payment date and not journal date. When you later Pay EMI you may pay on another day; the original due date stays on the schedule row.",
        "Must be on or after Disbursement Date. Invalid calendars (for example 31 February) are rejected.",
      ],
    },
    {
      title: "पहली भुगतान तिथि",
      paragraphs: [
        "यह किस्त संख्या 1 की देय तिथि है। बाद की सब देय तिथियाँ इसी से Payment Frequency (और Payment Day नियम) जोड़कर बनती हैं। उदाहरण: पहली EMI 1 सितंबर 2026 मासिक → 1 अक्टूबर, 1 नवंबर, इत्यादि; फरवरी और माह-अंत सहीClamp होते हैं।",
        "देय तिथि भुगतान तिथि या जर्नल तिथि नहीं है। बाद में Pay EMI किसी और दिन हो सकता है; मूल देय तिथि पंक्ति पर रहती है।",
        "Disbursement Date के बाद या उसी दिन होनी चाहिए। अमान्य कैलेंडर (जैसे 31 फरवरी) अस्वीकृत होते हैं।",
      ],
    },
    {
      title: "पहिलो भुक्तानी मिति",
      paragraphs: [
        "यो किस्ता नम्बर १ को देय मिति हो। पछिका सबै देय मिति यहीबाट Payment Frequency (र Payment Day नियम) जोडेर बन्छन्। उदाहरण: पहिलो EMI १ सेप्टेम्बर २०२६ मासिक → १ अक्टोबर, १ नोभेम्बर, आदि; फेब्रुअरी र महिना-अन्त सही clamp हुन्छन्।",
        "देय मिति भुक्तानी मिति वा जर्नल मिति होइन। पछि Pay EMI अर्को दिन हुन सक्छ; मूल देय मिति पङ्क्तिमा रहन्छ।",
        "Disbursement Date पछि वा सोही दिन हुनुपर्छ। अमान्य पात्रो (जस्तै ३१ फेब्रुअरी) अस्वीकार हुन्छ।",
      ],
    }
  ),

  paymentDayMode: intro(
    {
      title: "Payment Day rule",
      paragraphs: [
        "This rule decides the day-of-month for generated due dates. Same day of month keeps the day from First Payment Date, clamping when the month is shorter (31 January → 28 or 29 February). Month end always uses the last calendar day of that month. Custom day uses the number you type (1–31), also clamped.",
        "This does not change interest method. It only places dates. After you choose a rule, the (i) under the dropdown explains that rule.",
      ],
    },
    {
      title: "भुगतान दिन नियम",
      paragraphs: [
        "यह नियम उत्पन्न देय तिथियों का महीने का दिन तय करता है। Same day of month पहली EMI वाला दिन रखता है, छोटे महीने में घटाकर (31 जनवरी → 28 या 29 फरवरी)। Month end उस महीने का अंतिम दिन है। Custom day आपका नंबर (1–31) है, छोटे महीने में घटाया जाता है।",
        "यह ब्याज विधि नहीं बदलता, केवल तिथियाँ रखता है। नियम चुनने के बाद ड्रॉपडाउन के नीचे (i) उस नियम को समझाता है।",
      ],
    },
    {
      title: "भुक्तानी दिन नियम",
      paragraphs: [
        "यो नियमले उत्पन्न देय मितिको महिनाको दिन तोक्छ। Same day of month ले पहिलो EMI को दिन राख्छ, छोटो महिनामा घटाएर (३१ जनवरी → २८ वा २९ फेब्रुअरी)। Month end सो महिनाको अन्तिम दिन हो। Custom day तपाईंको संख्या (१–३१) हो, छोटो महिनामा घटाइन्छ।",
        "यसले ब्याज विधि बदल्दैन, केवल मिति राख्छ। नियम रोजेपछि ड्रपडाउन मुनिको (i) ले सो नियम बुझाउँछ।",
      ],
    }
  ),

  paymentDay: intro(
    {
      title: "Custom payment day (1–31)",
      paragraphs: [
        "Used only when Payment Day is Custom day. Type the day of the month every installment should target, for example 15 for the 15th. If a month has fewer days, the last day of that month is used (February 15 stays 15; day 31 becomes 28, 29, or 30 as required).",
        "This is still a due date rule, not the day you must physically pay. Journal date is chosen later on Pay EMI.",
      ],
    },
    {
      title: "कस्टम भुगतान दिन (1–31)",
      paragraphs: [
        "केवल जब Payment Day Custom day हो। हर किस्त का लक्षित दिन लिखें, जैसे 15। महीने में कम दिन हों तो उस महीने का अंतिम दिन लगता है (फरवरी 15 रहेगा 15; दिन 31 बनेगा 28, 29 या 30)।",
        "यह अभी भी देय तिथि नियम है, भौतिक भुगतान का अनिवार्य दिन नहीं। जर्नल तिथि बाद में Pay EMI पर चुनते हैं।",
      ],
    },
    {
      title: "कस्टम भुक्तानी दिन (१–३१)",
      paragraphs: [
        "Payment Day Custom day हुँदा मात्र। प्रत्येक किस्ताको लक्षित दिन लेख्नुहोस्, जस्तै १५। महिनामा कम दिन भए सो महिनाको अन्तिम दिन लाग्छ (फेब्रुअरी १५ रहन्छ १५; दिन ३१ बन्छ २८, २९ वा ३०)।",
        "यो अझै देय मिति नियम हो, भौतिक भुक्तानीको अनिवार्य दिन होइन। जर्नल मिति पछि Pay EMI मा छानिन्छ।",
      ],
    }
  ),

  gracePeriodDays: intro(
    {
      title: "Grace Period (days)",
      paragraphs: [
        "Grace is extra calendar days after the due date before the installment is treated as Overdue. 0 means the day after due date can already be overdue. 5, 10, or 15 are common. Overdue status and late-fee day count start only after Due Date + Grace.",
        "Grace does not hide the Due status on the due date itself. On the due date the row can show Due; after grace it becomes Overdue if still unpaid. Late fee is not posted automatically unless you configured auto-post; this form’s Late Fee Mode explains calculation.",
      ],
    },
    {
      title: "ग्रहण अवधि (दिन)",
      paragraphs: [
        "Grace देय तिथि के बाद अतिरिक्त कैलेंडर दिन हैं, उसके बाद किस्त Overdue मानी जाती है। 0 का अर्थ है देय के अगले दिन ही अतिदेय हो सकती है। 5, 10, 15 आम हैं। Overdue स्थिति और विलंब शुल्क के दिन केवल Due Date + Grace के बाद गिने जाते हैं।",
        "Grace देय तिथि पर Due छिपाता नहीं। देय दिन पंक्ति Due दिखा सकती है; ग्रेस बाद भी न चुका हो तो Overdue। विलंब शुल्क अपने आप जर्नल नहीं होता जब तक auto-post न हो; गणना Late Fee Mode में है।",
      ],
    },
    {
      title: "ग्रहण अवधि (दिन)",
      paragraphs: [
        "Grace देय मितिपछिका थप पात्रो दिन हुन्, त्यसपछि किस्ता Overdue मानिन्छ। ० को अर्थ देयको भोलिपल्टै अतिदेय हुन सक्छ। ५, १०, १५ सामान्य हुन्। Overdue स्थिति र ढिलो शुल्कका दिन Due Date + Grace पछि मात्र गनिन्छन्।",
        "Grace ले देय मितिमा Due लुकाउँदैन। देय दिन पङ्क्ति Due देखाउन सक्छ; ग्रेसपछि पनि नतिरे Overdue। ढिलो शुल्क आफैं जर्नल हुँदैन जबसम्म auto-post छैन; गणना Late Fee Mode मा छ।",
      ],
    }
  ),

  dayBasis: intro(
    {
      title: "Day Basis (365 / 366 / 360)",
      paragraphs: [
        "Day Basis is the year length used when interest is computed from actual days, mainly Daily Reducing Balance: interest = outstanding × annual rate × days / basis. Banks sometimes use 360 (commercial), 365 (ordinary), or 366 (leap-year convention). It is not used as a hard-coded 365 everywhere.",
        "For monthly reducing EMI the periodic rate still comes from frequency (rate/12), not from this basis. After you pick 365, 366, or 360, click (i) under the dropdown for that convention.",
      ],
    },
    {
      title: "दिन आधार (365 / 366 / 360)",
      paragraphs: [
        "Day Basis वर्ष की लंबाई है जब ब्याज वास्तविक दिनों से निकले, मुख्यतः Daily Reducing: ब्याज = बकाया × वार्षिक दर × दिन / आधार। बैंक कभी 360 (वाणिज्यिक), 365 (सामान्य), 366 (लीप वर्ष) उपयोग करते हैं। हर जगह 365 कठोर नहीं लिखा गया।",
        "मासिक reducing EMI की आवधिक दर आवृत्ति से आती है (दर/12), इस आधार से नहीं। 365, 366 या 360 चुनने के बाद ड्रॉपडाउन के नीचे (i) उस प्रथा को समझाता है।",
      ],
    },
    {
      title: "दिन आधार (३६५ / ३६६ / ३६०)",
      paragraphs: [
        "Day Basis वर्षको लम्बाइ हो जब ब्याज वास्तविक दिनबाट निस्कन्छ, मुख्यतः Daily Reducing: ब्याज = बाँकी × वार्षिक दर × दिन / आधार। बैंक कहिले ३६० (व्यावसायिक), ३६५ (सामान्य), ३६६ (लीप वर्ष) प्रयोग गर्छन्। सबै ठाउँमा ३६५ कडा लेखिएको छैन।",
        "मासिक reducing EMI को आवधिक दर आवृत्तिबाट आउँछ (दर/१२), यो आधारबाट होइन। ३६५, ३६६ वा ३६० रोजेपछि ड्रपडाउन मुनिको (i) ले सो प्रथा बुझाउँछ।",
      ],
    }
  ),

  lateFeeMode: intro(
    {
      title: "Late Fee Mode",
      paragraphs: [
        "This chooses how overdue charges are calculated when an installment is past Due Date + Grace: none, a fixed rupee amount, a percentage of overdue, or a daily percentage times days overdue. Calculation is shown on Pay EMI; posting to the late-fee expense account happens only if you include it or if auto-post is on.",
        "None means no late fee is computed. Fixed uses Late Fee Value as rupees. Percent uses Late Fee Value as percent of remaining due. Daily percent uses Late Fee Value as percent per overdue day. Posted historical journals are not altered when you change this later.",
      ],
    },
    {
      title: "विलंब शुल्क विधि",
      paragraphs: [
        "किस्त Due Date + Grace से आगे हो तो अतिदेय शुल्क कैसे निकले: नहीं, निश्चित रुपया, बकाया का प्रतिशत, या प्रति अतिदेय दिन प्रतिशत। गणना Pay EMI पर दिखती है; लेट-फी खर्च खाते में पोस्ट तभी जब आप शामिल करें या auto-post हो।",
        "None का अर्थ गणना नहीं। Fixed में Late Fee Value रुपये हैं। Percent में Late Fee Value शेष देय का प्रतिशत है। Daily percent में प्रति अतिदेय दिन प्रतिशत है। बाद में मोड बदलने से पुराने जर्नल नहीं बदलते।",
      ],
    },
    {
      title: "ढिलो शुल्क विधि",
      paragraphs: [
        "किस्ता Due Date + Grace नाघेपछि अतिदेय शुल्क कसरी निस्कन्छ: छैन, निश्चित रुपैयाँ, बाँकीको प्रतिशत, वा प्रति अतिदेय दिन प्रतिशत। गणना Pay EMI मा देखिन्छ; ढिलो-शुल्क खर्च खातामा पोस्ट तब मात्र जब तपाईं समावेश गर्नुहुन्छ वा auto-post हुन्छ।",
        "None को अर्थ गणना छैन। Fixed मा Late Fee Value रुपैयाँ हो। Percent मा Late Fee Value बाँकी देयको प्रतिशत हो। Daily percent मा प्रति अतिदेय दिन प्रतिशत हो। पछि मोड बदलदा पुराना जर्नल बदलिँदैनन्।",
      ],
    }
  ),

  lateFeeValue: intro(
    {
      title: "Late Fee Value",
      paragraphs: [
        "The meaning of this number depends on Late Fee Mode. For Fixed it is rupees (for example 500). For Percent it is percent of overdue (for example 2 means 2%). For Daily percent it is percent per overdue day (for example 0.05). For None it is ignored.",
        "It is not posted until an EMI is paid with late fee included or auto-post is enabled. It never changes principal versus interest split of the regular EMI.",
      ],
    },
    {
      title: "विलंब शुल्क मान",
      paragraphs: [
        "इस संख्या का अर्थ Late Fee Mode पर निर्भर है। Fixed में रुपये (जैसे 500)। Percent में अतिदेय का प्रतिशत (2 = 2%)। Daily percent में प्रति अतिदेय दिन प्रतिशत (जैसे 0.05)। None पर अनदेखा।",
        "EMI के साथ लेट फी शामिल करने या auto-post होने तक पोस्ट नहीं होता। नियमित EMI के मूलधन/ब्याज विभाजन को नहीं बदलता।",
      ],
    },
    {
      title: "ढिलो शुल्क मान",
      paragraphs: [
        "यो संख्याको अर्थ Late Fee Mode मा भर पर्छ। Fixed मा रुपैयाँ (जस्तै ५००)। Percent मा अतिदेयको प्रतिशत (२ = २%)। Daily percent मा प्रति अतिदेय दिन प्रतिशत (जस्तै ०.०५)। None मा बेवास्ता।",
        "EMI सँग ढिलो शुल्क समावेश वा auto-post नभएसम्म पोस्ट हुँदैन। नियमित EMI को सावा/ब्याज विभाजन बदल्दैन।",
      ],
    }
  ),

  bankAccountId: intro(
    {
      title: "Bank / Cash Account",
      paragraphs: [
        "This is YOUR money ledger — the Bank or Cash account in Pocket Ledger that receives the loan and from which EMI will be paid. Journals debit this account on disbursement and credit it on EMI, charges, and prepayment.",
        "It is not the loan liability. Liability is the Loans & Liabilities staff account. If you use Add Existing Account, the bank you converted stays selected here, and a separate liability account is created or linked.",
        "You must select an existing Bank/Cash account. The form does not invent a bank. Create the bank first under Bank/Cash if it is missing.",
      ],
    },
    {
      title: "बैंक / नकद खाता",
      paragraphs: [
        "यह आपका धन खाता है — Pocket Ledger का बैंक या कैश खाता जिसमें लोन आएगा और जिससे EMI निकलेगी। डिस्बर्सल पर यह खाता डेबिट, EMI/शुल्क/पूर्वभुगतान पर क्रेडिट होता है।",
        "यह लोन देनदारी नहीं है। देनदारी Loans & Liabilities का स्टाफ खाता है। Add Existing Account से कनवर्ट किया बैंक यहाँ चुना रहता है, और अलग देनदारी खाता बनता या जुड़ता है।",
        "मौजूदा Bank/Cash चुनना अनिवार्य है। फ़ॉर्म बैंक गढ़ता नहीं। न हो तो पहले Bank/Cash में खाता बनाएँ।",
      ],
    },
    {
      title: "बैंक / नगद खाता",
      paragraphs: [
        "यो तपाईंको पैसा खाता हो — Pocket Ledger को बैंक वा नगद खाता जहाँ ऋण आउँछ र जहाँबाट EMI तिर्नुहुन्छ। डिस्बर्सलमा यो खाता डेबिट, EMI/शुल्क/अग्रिम भुक्तानीमा क्रेडिट हुन्छ।",
        "यो ऋण दायित्व होइन। दायित्व Loans & Liabilities को स्टाफ खाता हो। Add Existing Account बाट कन्भर्ट गरिएको बैंक यहाँ चयनित रहन्छ, र छुट्टै दायित्व खाता बन्छ वा जोडिन्छ।",
        "विद्यमान Bank/Cash छान्नु अनिवार्य छ। फारमले बैंक बनाउँदैन। नभए पहिले Bank/Cash मा खाता बनाउनुहोस्।",
      ],
    }
  ),

  loanAccountId: intro(
    {
      title: "Loan Liability Account",
      paragraphs: [
        "This is the credit ledger for the borrowing — a Staff account under the system group Loans & Liabilities. Disbursement credits this account; EMI principal and prepayment debit it. Your bank balance and this liability must stay two different accounts.",
        "Choose Create new (from loan name) to auto-create if no matching name exists, or pick an existing staff ledger. Add Existing Account also fills this after converting a bank: the bank stays the cash account; the new or reused staff ledger is the liability.",
        "Do not map a Bank/Cash id here. That would treat EMI as a bank transfer instead of reducing the loan payable.",
      ],
    },
    {
      title: "लोन देनदारी खाता",
      paragraphs: [
        "यह उधार का क्रेडिट खाता है — सिस्टम समूह Loans & Liabilities के अंतर्गत स्टाफ खाता। डिस्बर्सल इसे क्रेडिट करता है; EMI मूलधन और पूर्वभुगतान डेबिट। बैंक शेष और यह देनदारी दो अलग खाते रहने चाहिए।",
        "मिलता नाम न हो तो Create new (from loan name) से स्वतः निर्माण, या मौजूदा स्टाफ चुनें। Add Existing Account बैंक कनवर्ट कर इसे भरता है: बैंक नकद खाता रहता है; नया या पुराना स्टाफ देनदारी है।",
        "यहाँ Bank/Cash आईडी न लगाएँ। तब EMI बैंक अंतरण लगती, लोन देय घटता नहीं।",
      ],
    },
    {
      title: "ऋण दायित्व खाता",
      paragraphs: [
        "यो ऋणको क्रेडिट खाता हो — प्रणाली समूह Loans & Liabilities अन्तर्गत स्टाफ खाता। डिस्बर्सलले यसलाई क्रेडिट गर्छ; EMI सावा र अग्रिम भुक्तानी डेबिट। बैंक मौज्दात र यो दायित्व दुई फरक खाता हुनुपर्छ।",
        "मिल्ने नाम नभए Create new (from loan name) बाट आफैं बनाइन्छ, वा विद्यमान स्टाफ छान्नुहोस्। Add Existing Account ले बैंक कन्भर्ट गरी यो भर्छ: बैंक नगद खाता रहन्छ; नयाँ वा पुरानो स्टाफ दायित्व हो।",
        "यहाँ Bank/Cash आईडी नराख्नुहोस्। तब EMI बैंक स्थानान्तर जस्तो हुन्छ, ऋण तिर्न बाँकी घट्दैन।",
      ],
    }
  ),

  interestExpenseAccountId: intro(
    {
      title: "Interest Expense Account",
      paragraphs: [
        "This Income & Expense ledger receives Debit when you post EMI interest (and similar finance cost). Typical name is Loan Interest under Finance Costs. Create new creates that account in the Finance Costs group if it does not already exist by name.",
        "Choosing the wrong account (for example a party or bank) would put interest in the wrong profit-and-loss line. Prefer a dedicated expense ledger so Interest Paid reports stay clean.",
      ],
    },
    {
      title: "ब्याज खर्च खाता",
      paragraphs: [
        "EMI ब्याज पोस्ट होने पर यह आय-व्यय खाता डेबिट होता है। सामान्य नाम Finance Costs के अंतर्गत Loan Interest है। Create new उसी नाम का खाता समूह में बनाता है यदि पहले से न हो।",
        "गलत खाता (पार्टी या बैंक) चुनने से ब्याज गलत लाभ-हानि पंक्ति में जाता है। Interest Paid रिपोर्ट साफ रखने के लिए समर्पित खर्च खाता चुनें।",
      ],
    },
    {
      title: "ब्याज खर्च खाता",
      paragraphs: [
        "EMI ब्याज पोस्ट हुँदा यो आय-व्यय खाता डेबिट हुन्छ। सामान्य नाम Finance Costs अन्तर्गत Loan Interest हो। Create new ले सो नामको खाता समूहमा बनाउँछ यदि पहिले छैन।",
        "गलत खाता (पार्टी वा बैंक) रोजे ब्याज गलत नाफा-नोक्सान पङ्क्तिमा जान्छ। Interest Paid रिपोर्ट सफा राख्न समर्पित खर्च खाता रोज्नुहोस्।",
      ],
    }
  ),

  processingFeeAccountId: intro(
    {
      title: "Processing Fee Account",
      paragraphs: [
        "Used when you post a processing, documentation, or similar charge: Debit this expense, Credit Bank/Cash. Auto-create if missing makes Loan Processing Charges under Finance Costs when the name is not already there.",
        "You may pick another existing expense if your books already have a fee ledger. Charges are separate from EMI principal and interest.",
      ],
    },
    {
      title: "प्रोसेसिंग शुल्क खाता",
      paragraphs: [
        "प्रोसेसिंग, दस्तावेज़ या समान शुल्क पोस्ट करने पर: इस खर्च को डेबिट, बैंक/नकद क्रेडिट। Auto-create if missing नाम न हो तो Finance Costs में Loan Processing Charges बनाता है।",
        "बहियों में पहले से शुल्क खाता हो तो वही चुन सकते हैं। शुल्क EMI मूलधन और ब्याज से अलग हैं।",
      ],
    },
    {
      title: "प्रोसेसिङ शुल्क खाता",
      paragraphs: [
        "प्रोसेसिङ, कागजात वा समान शुल्क पोस्ट गर्दा: यो खर्च डेबिट, बैंक/नगद क्रेडिट। Auto-create if missing ले नाम नभए Finance Costs मा Loan Processing Charges बनाउँछ।",
        "खातामा पहिले शुल्क खाता छ भने त्यही छान्न सकिन्छ। शुल्क EMI सावा र ब्याजभन्दा अलग हुन्।",
      ],
    }
  ),

  lateFeeAccountId: intro(
    {
      title: "Late Fee Account",
      paragraphs: [
        "Expense ledger for late payment charges: Debit this account, Credit Bank/Cash when a late fee is posted. Auto-create uses Loan Late Payment Charges under Finance Costs if that name is free.",
        "This is independent of Grace Period, which only delays Overdue status. Mapping the account does not auto-post a fee on every overdue night unless auto-post is enabled.",
      ],
    },
    {
      title: "विलंब शुल्क खाता",
      paragraphs: [
        "विलंब भुगतान खर्च खाता: शुल्क पोस्ट पर डेबिट यह, क्रेडिट बैंक/नकद। Auto-create नाम खाली हो तो Finance Costs में Loan Late Payment Charges बनाता है।",
        "यह Grace Period से स्वतंत्र है, जो केवल Overdue स्थिति देर से लगाता है। खाता मैप करने मात्र से हर रात शुल्क नहीं लगता जब तक auto-post न हो।",
      ],
    },
    {
      title: "ढिलो शुल्क खाता",
      paragraphs: [
        "ढिलो भुक्तानी खर्च खाता: शुल्क पोस्ट हुँदा डेबिट यो, क्रेडिट बैंक/नगद। Auto-create ले नाम खाली भए Finance Costs मा Loan Late Payment Charges बनाउँछ।",
        "यो Grace Period बाट स्वतन्त्र छ, जसले केवल Overdue स्थिति ढिलो लगाउँछ। खाता म्याप गर्दैमा हरेक रात शुल्क लाग्दैन जबसम्म auto-post हुँदैन।",
      ],
    }
  ),

  postDisbursementOnSave: intro(
    {
      title: "Post disbursement journal on save",
      paragraphs: [
        "When checked, Save Loan also posts a journal: Debit Bank/Cash (Disbursed Amount), Credit Loan Liability (same amount), voucher date = Disbursement Date. The loan becomes Active and the journal id is stored on the loan.",
        "Uncheck if you only want to register the schedule first and post money later. You cannot fully edit mapped amounts after a disbursement journal exists; corrections use proper reversal, not silent delete.",
      ],
    },
    {
      title: "सेव पर डिस्बर्सल जर्नल पोस्ट करें",
      paragraphs: [
        "चिह्नित हो तो Save Loan जर्नल भी पोस्ट करता है: डेबिट बैंक/नकद (Disbursed Amount), क्रेडिट लोन देनदारी (समान राशि), वाउचर तिथि = Disbursement Date। लोन Active होता है और जर्नल आईडी लोन पर जुड़ती है।",
        "केवल शेड्यूल दर्ज कर पैसा बाद में पोस्ट करना हो तो हटाएँ। डिस्बर्सल जर्नल के बाद राशियाँ पूरी तरह संपादित नहीं होतीं; सुधार उचित रिवर्सल से, चुपचाप मिटाकर नहीं।",
      ],
    },
    {
      title: "सेभमा डिस्बर्सल जर्नल पोस्ट गर्ने",
      paragraphs: [
        "चिन्ह लगाए Save Loan ले जर्नल पनि पोस्ट गर्छ: डेबिट बैंक/नगद (Disbursed Amount), क्रेडिट ऋण दायित्व (उही रकम), भाउचर मिति = Disbursement Date। ऋण Active हुन्छ र जर्नल आईडी ऋणमा जोडिन्छ।",
        "पहिले तालिका मात्र राखी पैसा पछि पोस्ट गर्ने हो भने हटाउनुहोस्। डिस्बर्सल जर्नलपछि रकम पूर्ण सम्पादन हुँदैन; सुधार उचित रिभर्सलबाट, चुपचाप मेटाएर होइन।",
      ],
    }
  ),

  liabilityDocuments: intro(
    {
      title: "Documents",
      paragraphs: [
        "Optional supporting files (PDF or images — e.g. registration, agreement scans). Up to 5 files; stored with this loan liability account and available from the statement.",
        "On the loan liability account statement they show on the opening balance row under the File column (green tick), like voucher attachments.",
      ],
    },
    {
      title: "दस्तावेज़",
      paragraphs: [
        "वैकल्पिक सहायक फ़ाइलें (PDF या चित्र — जैसे पंजीकरण, समझौते की स्कैन)। अधिकतम 5 फ़ाइलें; इस लोन देनदारी खाते के साथ संग्रहीत और स्टेटमेंट से उपलब्ध।",
        "लोन देनदारी खाते की स्टेटमेंट पर वे Opening Balance पंक्ति के File कॉलम (हरा टिक) में दिखते हैं, वाउचर अटैचमेंट की तरह।",
      ],
    },
    {
      title: "कागजात",
      paragraphs: [
        "वैकल्पिक सहायक फाइल (PDF वा तस्बिर — जस्तै दर्ता, सम्झौता स्क्यान)। अधिकतम 5 फाइल; यो ऋण दायित्व खातासँग भण्डारण र स्टेटमेन्टबाट उपलब्ध।",
        "ऋण दायित्व खाताको स्टेटमेन्टमा Opening Balance पङ्क्तिको File स्तम्भ (हरियो टिक) मा देखिन्छ, भाउचर अट्याचमेन्ट जस्तै।",
      ],
    }
  ),

  notes: intro(
    {
      title: "Notes",
      paragraphs: [
        "Free text for sanction conditions, collateral, contact person, or file numbers. Stored on the loan master and audit-friendly. Not posted as a journal unless you copy the same words into a voucher narration later.",
        "Do not store passwords or OTPs here. Use Documents tab after save for titles of physical files.",
      ],
    },
    {
      title: "टिप्पणियाँ",
      paragraphs: [
        "स्वीकृति शर्तें, जमानत, संपर्क व्यक्ति या फ़ाइल नंबर के लिए मुक्त पाठ। लोन मास्टर पर रहता है और ऑडिट में सहायक है। बाद में वाउचर विवरण में न लिखें तो जर्नल नहीं बनता।",
        "यहाँ पासवर्ड या OTP न रखें। सेव के बाद Documents टैब में भौतिक फ़ाइलों के शीर्षक दर्ज करें।",
      ],
    },
    {
      title: "टिप्पणी",
      paragraphs: [
        "स्वीकृति सर्त, धितो, सम्पर्क व्यक्ति वा फाइल नम्बरका लागि स्वतन्त्र पाठ। ऋण मास्टरमा रहन्छ र अडिटमा सहयोगी छ। पछि भाउचर विवरणमा नलेखे जर्नल बन्दैन।",
        "यहाँ पासवर्ड वा OTP नराख्नुहोस्। सेभपछि Documents ट्याबमा भौतिक फाइलका शीर्षक लेख्नुहोस्।",
      ],
    }
  ),

  calculateSchedule: intro(
    {
      title: "Calculate Schedule",
      paragraphs: [
        "This button runs the calculation engine without saving the loan. It shows EMI, installment count, total interest, total repayment, and maturity (last due date). Fix validation errors (principal, dates, bank account) first.",
        "The preview is not stored until Save Loan. Changing any financial field clears the preview so you cannot save a stale EMI by accident.",
      ],
    },
    {
      title: "शेड्यूल गणना करें",
      paragraphs: [
        "यह बटन लोन सेव किए बिना गणना चलाता है। EMI, किस्त संख्या, कुल ब्याज, कुल चुकौती और परिपक्वता (अंतिम देय) दिखते हैं। पहले सत्यापन त्रुटियाँ (मूलधन, तिथि, बैंक) ठीक करें।",
        "पूर्वावलोकन Save Loan तक संग्रहित नहीं होता। कोई वित्तीय फ़ील्ड बदलने पर पूर्वावलोकन मिटता है ताकि पुरानी EMI सेव न हो।",
      ],
    },
    {
      title: "तालिका गणना गर्नुहोस्",
      paragraphs: [
        "यो बटनले ऋण नसेभी गणना चलाउँछ। EMI, किस्ता संख्या, कुल ब्याज, कुल भुक्तानी र परिपक्वता (अन्तिम देय) देखिन्छन्। पहिले प्रमाणीकरण त्रुटि (सावा, मिति, बैंक) मिलाउनुहोस्।",
        "पूर्वावलोकन Save Loan सम्म संग्रह हुँदैन। कुनै वित्तीय फिल्ड बदलदा पूर्वावलोकन मेटिन्छ ताकि पुरानो EMI सेभ नहोस्।",
      ],
    }
  ),

  saveLoan: intro(
    {
      title: "Save Loan",
      paragraphs: [
        "Validates the form, ensures liability and expense accounts (create if you asked), writes the loan and full schedule for this company only, writes opening rate history and audit, and optionally posts the disbursement journal. Other companies never see this loan.",
        "After a disbursement journal exists, do not expect this create form to rewrite posted books. Use Pay EMI, Prepayment, Rate Change, Charges, and Close on the loan details screen.",
      ],
    },
    {
      title: "लोन सहेजें",
      paragraphs: [
        "फ़ॉर्म जाँचता है, देनदारी और खर्च खाते सुनिश्चित करता है (यदि आपने निर्माण चुना), केवल इसी कंपनी के लिए लोन और पूरा शेड्यूल लिखता है, प्रारंभिक दर इतिहास और ऑडिट लिखता है, और वैकल्पिक डिस्बर्सल जर्नल पोस्ट करता है। दूसरी कंपनियाँ यह लोन नहीं देखतीं।",
        "डिस्बर्सल जर्नल के बाद यह निर्माण फ़ॉर्म पोस्ट बही नहीं लिखेगा। विवरण स्क्रीन पर Pay EMI, Prepayment, Rate Change, Charges और Close उपयोग करें।",
      ],
    },
    {
      title: "ऋण सेभ गर्नुहोस्",
      paragraphs: [
        "फारम जाँच्छ, दायित्व र खर्च खाता सुनिश्चित गर्छ (निर्माण रोजेको भए), यही कम्पनीका लागि मात्र ऋण र पूरा तालिका लेख्छ, सुरुको दर इतिहास र अडिट लेख्छ, र वैकल्पिक डिस्बर्सल जर्नल पोस्ट गर्छ। अर्को कम्पनीले यो ऋण देख्दैन।",
        "डिस्बर्सल जर्नलपछि यो निर्माण फारमले पोस्ट किताब लेख्दैन। विवरण स्क्रिनमा Pay EMI, Prepayment, Rate Change, Charges र Close प्रयोग गर्नुहोस्।",
      ],
    }
  ),

  convertPickBank: intro(
    {
      title: "Choose the existing Bank/Cash account",
      paragraphs: [
        "The list shows Bank and Cash ledgers of this company that are not deleted. Search by account name. The account you pick will remain a Bank/Cash ledger for money in and out. Conversion creates or reuses a Loans & Liabilities account for the payable.",
        "Special or frozen banks can still be listed; frozen masters may block later vouchers according to company freeze rules. Prefer the current account that actually received the loan credit from the lender.",
      ],
    },
    {
      title: "मौजूदा बैंक/नकद खाता चुनें",
      paragraphs: [
        "सूची में इस कंपनी के न मिटे बैंक और कैश खाते हैं। नाम से खोजें। चुना खाता धन के आवक-जावक के लिए बैंक/नकद ही रहेगा। कनवर्जन देय के लिए Loans & Liabilities खाता बनाता या पुनः उपयोग करता है।",
        "विशेष या फ्रीज बैंक सूची में आ सकते हैं; फ्रीज बाद के वाउचर रोक सकता है। वही चालू खाता चुनें जिसमें ऋणदाता ने वास्तव में क्रेडिट किया।",
      ],
    },
    {
      title: "विद्यमान बैंक/नगद खाता छान्नुहोस्",
      paragraphs: [
        "सूचीमा यस कम्पनीका नमेटिएका बैंक र नगद खाता छन्। नामले खोज्नुहोस्। छानिएको खाता पैसा आवतजावतका लागि बैंक/नगद नै रहन्छ। कन्भर्जनले तिर्न बाँकीका लागि Loans & Liabilities खाता बनाउँछ वा पुनः प्रयोग गर्छ।",
        "विशेष वा फ्रिज बैंक सूचीमा आउन सक्छन्; फ्रिजले पछिका भाउचर रोक्न सक्छ। जुन चालू खातामा ऋणदाताले वास्तवमा क्रेडिट गर्यो त्यही छान्नुहोस्।",
      ],
    }
  ),

  convertLoanLedgerName: intro(
    {
      title: "Loan ledger name (after convert)",
      paragraphs: [
        "This becomes the Staff / Loans & Liabilities account name. Default is the bank account name plus the word Loan, for example “Nabil Current Loan”. Edit it so it is distinct from the bank ledger name. Two different accounts must exist: bank (asset) and loan (liability).",
        "On Save, Pocket Ledger finds a staff account with this exact name or creates one under Loans & Liabilities, marks it as a loan account, and stores the link on the bank record so a second convert reuses the same liability.",
      ],
    },
    {
      title: "लोन खाता नाम (कनवर्ट के बाद)",
      paragraphs: [
        "यह स्टाफ / Loans & Liabilities खाते का नाम बनता है। डिफ़ॉल्ट बैंक खाता नाम + Loan है, जैसे “Nabil Current Loan”। बैंक खाता नाम से अलग रखें। दो खाते चाहिए: बैंक (संपत्ति) और लोन (देनदारी)।",
        "सेव पर Pocket Ledger इसी नाम का स्टाफ ढूँढता या Loans & Liabilities में बनाता है, लोन खाता चिह्नित करता है, और बैंक रिकॉर्ड पर लिंक रखता है ताकि दूसरी कनवर्ट वही देनदारी दोहराए।",
      ],
    },
    {
      title: "ऋण खाता नाम (कन्भर्टपछि)",
      paragraphs: [
        "यो स्टाफ / Loans & Liabilities खाताको नाम बन्छ। पूर्वनिर्धारित बैंक खाता नाम + Loan हो, जस्तै “Nabil Current Loan”। बैंक खाता नामभन्दा फरक राख्नुहोस्। दुई खाता चाहिन्छ: बैंक (सम्पत्ति) र ऋण (दायित्व)।",
        "सेभमा Pocket Ledger ले यही नामको स्टाफ खोज्छ वा Loans & Liabilities मा बनाउँछ, ऋण खाता चिन्ह लगाउँछ, र बैंक रेकर्डमा लिंक राख्छ ताकि दोस्रो कन्भर्टले सोही दायित्व दोहोर्याओस्।",
      ],
    }
  ),

  convertLenderName: intro(
    {
      title: "Lender name for this conversion",
      paragraphs: [
        "Filled from the bank’s stored bank name or account name. It becomes Lender on the loan form after convert. You can still change it. It does not rename the Bank/Cash master itself.",
      ],
    },
    {
      title: "इस कनवर्जन का ऋणदाता नाम",
      paragraphs: [
        "बैंक के संग्रहित बैंक नाम या खाता नाम से भरता है। कनवर्ट के बाद फ़ॉर्म पर Lender बनता है। बदल सकते हैं। Bank/Cash मास्टर का नाम नहीं बदलता।",
      ],
    },
    {
      title: "यो कन्भर्जनको ऋणदाता नाम",
      paragraphs: [
        "बैंकमा राखिएको बैंक नाम वा खाता नामबाट भरिन्छ। कन्भर्टपछि फारममा Lender बन्छ। बदल्न सकिन्छ। Bank/Cash मास्टरको नाम बदल्दैन।",
      ],
    }
  ),
};

const opt = (key: string, set: LoanIntroSet) => {
  LOAN_FORM_INTROS[key] = set;
};

opt(
  "opt:lenderType:Bank",
  intro(
    { title: "Lender type: Bank", paragraphs: ["Commercial or development bank that sanctioned the facility. Reports can filter all Bank lenders. Journals still use the mapped Bank/Cash and liability accounts, not this label alone."] },
    { title: "ऋणदाता प्रकार: बैंक", paragraphs: ["सुविधा स्वीकृत करने वाला वाणिज्यिक या विकास बैंक। रिपोर्ट सब बैंक ऋणदाता फ़िल्टर कर सकती हैं। जर्नल फिर भी मैप किए बैंक/नकद और देनदारी खातों से चलते हैं, केवल इस लेबल से नहीं।"] },
    { title: "ऋणदाता प्रकार: बैंक", paragraphs: ["सुविधा स्वीकृत गर्ने वाणिज्यिक वा विकास बैंक। रिपोर्टले सबै बैंक ऋणदाता फिल्टर गर्न सक्छ। जर्नल फेरि पनि म्याप गरिएका बैंक/नगद र दायित्व खाताबाट चल्छन्, यो लेबलबाट मात्र होइन।"] }
  )
);
opt(
  "opt:lenderType:NBFC",
  intro(
    { title: "Lender type: NBFC", paragraphs: ["Non-bank finance company or hire-purchase financier. Same EMI engine as Bank; the type is for classification and outstanding reports by lender class."] },
    { title: "ऋणदाता प्रकार: NBFC", paragraphs: ["गैर-बैंक वित्त कंपनी या किराया-खरीद वित्तदाता। EMI इंजन बैंक जैसा; प्रकार वर्गीकरण और ऋणदाता वर्ग की बकाया रिपोर्ट के लिए है।"] },
    { title: "ऋणदाता प्रकार: NBFC", paragraphs: ["गैर-बैंक वित्त कम्पनी वा भाडा-खरिद वित्तदाता। EMI इन्जिन बैंकजस्तै; प्रकार वर्गीकरण र ऋणदाता वर्गको बाँकी रिपोर्टका लागि हो।"] }
  )
);
opt(
  "opt:lenderType:Cooperative",
  intro(
    { title: "Lender type: Cooperative", paragraphs: ["Savings-and-credit cooperative or similar. Use when the sanction is from a sahakari, not a commercial bank. Accounting mapping is unchanged."] },
    { title: "ऋणदाता प्रकार: सहकारी", paragraphs: ["बचत-ऋण सहकारी या समान। स्वीकृति सहकारी से हो, वाणिज्यिक बैंक से नहीं। खाता मैपिंग वही रहती है।"] },
    { title: "ऋणदाता प्रकार: सहकारी", paragraphs: ["बचत-ऋण सहकारी वा समान। स्वीकृति सहकारीबाट हो, वाणिज्यिक बैंकबाट होइन। खाता म्यापिङ उही रहन्छ।"] }
  )
);
opt(
  "opt:lenderType:Individual",
  intro(
    { title: "Lender type: Individual", paragraphs: ["A person lent the money (relative, director, or private lender). Still create a liability staff account; do not post the loan only as a party receipt unless that is your policy — this module expects a loan liability ledger."] },
    { title: "ऋणदाता प्रकार: व्यक्ति", paragraphs: ["व्यक्ति ने धन उधार दिया (रिश्तेदार, निदेशक, निजी ऋणदाता)। फिर भी देनदारी स्टाफ खाता बनाएँ; जब तक नीति न हो केवल पार्टी रसीद से लोन न चलाएँ — यह मॉड्यूल लोन देनदारी खाता चाहता है।"] },
    { title: "ऋणदाता प्रकार: व्यक्ति", paragraphs: ["व्यक्तिले पैसा ऋण दियो (नातेदार, निर्देशक, निजी ऋणदाता)। फेरि पनि दायित्व स्टाफ खाता बनाउनुहोस्; नीति नभएसम्म पार्टी रसिदबाट मात्र ऋण नचलाउनुहोस् — यो मोड्युलले ऋण दायित्व खाता चाहन्छ।"] }
  )
);
opt(
  "opt:lenderType:Government",
  intro(
    { title: "Lender type: Government", paragraphs: ["Official scheme, subsidy-linked, or government financial institution. Classification only; interest method and accounts are still chosen on this form."] },
    { title: "ऋणदाता प्रकार: सरकार", paragraphs: ["सरकारी योजना, सब्सिडी-संबंधित, या सरकारी वित्त संस्था। केवल वर्गीकरण; ब्याज विधि और खाते इसी फ़ॉर्म पर चुने जाते हैं।"] },
    { title: "ऋणदाता प्रकार: सरकार", paragraphs: ["सरकारी योजना, अनुदान-सम्बन्धित, वा सरकारी वित्त संस्था। केवल वर्गीकरण; ब्याज विधि र खाता यही फारममा छानिन्छन्।"] }
  )
);
opt(
  "opt:lenderType:Other",
  intro(
    { title: "Lender type: Other", paragraphs: ["Use when the creditor is not bank, NBFC, cooperative, person, or government. Type the real name in Lender / Bank. Journals follow mapped accounts."] },
    { title: "ऋणदाता प्रकार: अन्य", paragraphs: ["लेनदार बैंक, NBFC, सहकारी, व्यक्ति या सरकार न हो तब। असली नाम Lender / Bank में लिखें। जर्नल मैप खातों से चलते हैं।"] },
    { title: "ऋणदाता प्रकार: अन्य", paragraphs: ["लेनदार बैंक, NBFC, सहकारी, व्यक्ति वा सरकार नभए। वास्तविक नाम Lender / Bank मा लेख्नुहोस्। जर्नल म्याप खाताबाट चल्छन्।"] }
  )
);

opt(
  "opt:loanType:Term Loan",
  intro(
    { title: "Loan type: Term Loan", paragraphs: ["A facility repaid over a fixed tenure with a schedule of installments. Typical for machinery or expansion. EMI still depends on method and rate, not on this label."] },
    { title: "लोन प्रकार: सावधि ऋण", paragraphs: ["निश्चित अवधि में किस्तों से चुकता सुविधा। मशीनरी या विस्तार के लिए आम। EMI विधि और दर से निकलती है, केवल इस लेबल से नहीं।"] },
    { title: "ऋण प्रकार: सावधि ऋण", paragraphs: ["निश्चित अवधिमा किस्ताबाट चुक्ता हुने सुविधा। मेसिनरी वा विस्तारका लागि सामान्य। EMI विधि र दरबाट निस्कन्छ, यो लेबलबाट मात्र होइन।"] }
  )
);
opt(
  "opt:loanType:Business Loan",
  intro(
    { title: "Loan type: Business Loan", paragraphs: ["Borrowing for trading or operations. Same engines as other types; use this so business-purpose reports group correctly."] },
    { title: "लोन प्रकार: व्यापार ऋण", paragraphs: ["व्यापार या संचालन के लिए उधार। इंजन अन्य प्रकार जैसे; व्यापार-उद्देश्य रिपोर्ट सही समूह के लिए यह चुनें।"] },
    { title: "ऋण प्रकार: व्यापार ऋण", paragraphs: ["व्यापार वा सञ्चालनका लागि ऋण। इन्जिन अन्य प्रकारजस्तै; व्यापार-उद्देश्य रिपोर्ट सही समूहका लागि यो छान्नुहोस्।"] }
  )
);
opt(
  "opt:loanType:Personal Loan",
  intro(
    { title: "Loan type: Personal Loan", paragraphs: ["Unsecured or lightly documented personal facility. Still map a liability account and bank. Do not skip journals."] },
    { title: "लोन प्रकार: व्यक्तिगत ऋण", paragraphs: ["बिना भारी दस्तावेज़ का व्यक्तिगत ऋण। फिर भी देनदारी और बैंक मैप करें। जर्नल न छोड़ें।"] },
    { title: "ऋण प्रकार: व्यक्तिगत ऋण", paragraphs: ["हल्का कागजातको व्यक्तिगत सुविधा। फेरि पनि दायित्व र बैंक म्याप गर्नुहोस्। जर्नल नछोड्नुहोस्।"] }
  )
);
opt(
  "opt:loanType:Vehicle Loan",
  intro(
    { title: "Loan type: Vehicle Loan", paragraphs: ["Facility for vehicle purchase. Collateral note can go in Purpose or Notes. Schedule is still EMI-based unless you change method."] },
    { title: "लोन प्रकार: वाहन ऋण", paragraphs: ["वाहन खरीद की सुविधा। जमानत Purpose या Notes में लिखें। शेड्यूल विधि न बदलें तो EMI आधारित रहता है।"] },
    { title: "ऋण प्रकार: सवारी ऋण", paragraphs: ["सवारी खरिदको सुविधा। धितो Purpose वा Notes मा लेख्नुहोस्। विधि नबदले तालिका EMI आधारित रहन्छ।"] }
  )
);
opt(
  "opt:loanType:Home Loan",
  intro(
    { title: "Loan type: Home Loan", paragraphs: ["Long-tenure housing finance. Often monthly reducing balance. Tenure in years is common; frequency still generates every due date."] },
    { title: "लोन प्रकार: आवास ऋण", paragraphs: ["लंबी अवधि का आवास वित्त। अक्सर मासिक reducing। अवधि वर्षों में आम; आवृत्ति हर देय तिथि बनाती है।"] },
    { title: "ऋण प्रकार: आवास ऋण", paragraphs: ["लामो अवधिको आवास वित्त। प्रायः मासिक reducing। अवधि वर्षमा सामान्य; आवृत्तिले हरेक देय मिति बनाउँछ।"] }
  )
);
opt(
  "opt:loanType:Working Capital Loan",
  intro(
    { title: "Loan type: Working Capital Loan", paragraphs: ["Short-cycle operating finance. You may still use reducing EMI or another method as the sanction states. Outstanding reports help watch drawing power versus books."] },
    { title: "लोन प्रकार: कार्यशील पूँजी ऋण", paragraphs: ["छोटे चक्र का संचालन वित्त। स्वीकृति के अनुसार reducing EMI या अन्य विधि। बकाया रिपोर्ट बही बनाम ड्रॉइंग पावर देखने में सहायक।"] },
    { title: "ऋण प्रकार: चालु पुँजी ऋण", paragraphs: ["छोटो चक्रको सञ्चालन वित्त। स्वीकृतिअनुसार reducing EMI वा अन्य विधि। बाँकी रिपोर्टले बही बनाम ड्रइङ पावर हेर्न सहयोग गर्छ।"] }
  )
);
opt(
  "opt:loanType:Secured Loan",
  intro(
    { title: "Loan type: Secured Loan", paragraphs: ["Backed by collateral. Record the security in Purpose or Notes. Accounting split of EMI does not change only because it is secured."] },
    { title: "लोन प्रकार: जमानती ऋण", paragraphs: ["जमानत युक्त। सुरक्षा Purpose या Notes में लिखें। केवल जमानती होने से EMI का हिसाब विभाजन नहीं बदलता।"] },
    { title: "ऋण प्रकार: धितो ऋण", paragraphs: ["धितोयुक्त। सुरक्षा Purpose वा Notes मा लेख्नुहोस्। धितो भएकै कारणले मात्र EMI को हिसाब विभाजन बदलिँदैन।"] }
  )
);
opt(
  "opt:loanType:Unsecured Loan",
  intro(
    { title: "Loan type: Unsecured Loan", paragraphs: ["No registered charge on asset. Higher risk classification for reports; still post principal and interest to the mapped ledgers."] },
    { title: "लोन प्रकार: बिना जमानत ऋण", paragraphs: ["संपत्ति पर पंजीकृत भार नहीं। रिपोर्ट में अधिक जोखिम वर्ग; मूलधन और ब्याज फिर भी मैप खातों में पोस्ट करें।"] },
    { title: "ऋण प्रकार: बिना धितो ऋण", paragraphs: ["सम्पत्तिमा दर्ता भार छैन। रिपोर्टमा उच्च जोखिम वर्ग; सावा र ब्याज फेरि पनि म्याप खातामा पोस्ट गर्नुहोस्।"] }
  )
);
opt(
  "opt:loanType:Other",
  intro(
    { title: "Loan type: Other", paragraphs: ["Opens Custom Type. Write the official product name from the sanction letter. Calculations still use method, rate, and tenure."] },
    { title: "लोन प्रकार: अन्य", paragraphs: ["Custom Type खुलता है। स्वीकृति पत्र वाला आधिकारिक उत्पाद नाम लिखें। गणना विधि, दर और अवधि से ही होती है।"] },
    { title: "ऋण प्रकार: अन्य", paragraphs: ["Custom Type खुल्छ। स्वीकृति पत्रको आधिकारिक उत्पादन नाम लेख्नुहोस्। गणना विधि, दर र अवधिबाट नै हुन्छ।"] }
  )
);

opt(
  "opt:interestMethod:reducing_balance",
  intro(
    {
      title: "Method: Reducing Balance",
      paragraphs: [
        "Primary method for EMI loans. Each period: interest = current outstanding principal × periodic rate. Principal due = EMI − interest (last installment takes remaining principal). Outstanding falls every paid installment, so later interest rupees are smaller than the first.",
        "Periodic rate comes from annual rate and frequency (monthly = rate/12). This matches typical bank amortization. After save, Pay EMI posts Debit liability (principal) and Debit interest expense, Credit bank for the total paid.",
      ],
    },
    {
      title: "विधि: घटता शेष (Reducing Balance)",
      paragraphs: [
        "EMI लोन की मुख्य विधि। हर अवधि: ब्याज = वर्तमान बकाया मूलधन × आवधिक दर। देय मूलधन = EMI − ब्याज (अंतिम किस्त शेष मूलधन लेती है)। हर चुकाई किस्त पर बकाया गिरता है, इसलिए बाद का रुपया ब्याज पहली किस्त से कम होता है।",
        "आवधिक दर वार्षिक दर और आवृत्ति से (मासिक = दर/12)। सामान्य बैंक परिशोधन जैसा। सेव के बाद Pay EMI देनदारी (मूलधन) डेबिट, ब्याज खर्च डेबिट, बैंक क्रेडिट — चुकाई कुल राशि पर।",
      ],
    },
    {
      title: "विधि: घट्दो मौज्दात (Reducing Balance)",
      paragraphs: [
        "EMI ऋणको मुख्य विधि। प्रत्येक अवधि: ब्याज = हालको बाँकी सावा × आवधिक दर। देय सावा = EMI − ब्याज (अन्तिम किस्ता बाँकी सावा लिन्छ)। प्रत्येक तिरेको किस्तामा बाँकी घट्छ, त्यसैले पछिको रुपैयाँ ब्याज पहिलो किस्ताभन्दा सानो हुन्छ।",
        "आवधिक दर वार्षिक दर र आवृत्तिबाट (मासिक = दर/१२)। सामान्य बैंक परिशोधनजस्तै। सेभपछि Pay EMI ले दायित्व (सावा) डेबिट, ब्याज खर्च डेबिट, बैंक क्रेडिट — तिरेको कुल रकममा।",
      ],
    }
  )
);
opt(
  "opt:interestMethod:flat_rate",
  intro(
    {
      title: "Method: Flat Rate",
      paragraphs: [
        "Interest is computed on the original principal for the whole tenure (principal × annual rate × years), then divided equally across installments along with equal principal portions. Early installments therefore include more interest than reducing balance at the same advertised rate.",
        "Use only when the sanction letter states flat interest. Total interest is known at start. Last row adjusts rupees so principal still finishes at zero after rounding.",
      ],
    },
    {
      title: "विधि: फ्लैट दर",
      paragraphs: [
        "ब्याज पूरे अवधि के मूल मूलधन पर (मूलधन × वार्षिक दर × वर्ष), फिर समान मूलधन हिस्सों के साथ किस्तों में बाँटा जाता है। उसी विज्ञापित दर पर शुरुआती किस्तों में Reducing से अधिक ब्याज होता है।",
        "स्वीकृति पत्र फ्लैट ब्याज कहे तभी उपयोग करें। कुल ब्याज शुरुआत में ज्ञात। पूर्णांक के बाद भी मूलधन शून्य हो, इसके लिए अंतिम पंक्ति समायोजित होती है।",
      ],
    },
    {
      title: "विधि: फ्ल्याट दर",
      paragraphs: [
        "ब्याज पूरै अवधिको मूल सावामा (सावा × वार्षिक दर × वर्ष), अनि समान सावा हिस्सासँग किस्तामा बाँडिन्छ। उही विज्ञापित दरमा सुरुका किस्तामा Reducing भन्दा बढी ब्याज हुन्छ।",
        "स्वीकृति पत्रले फ्ल्याट ब्याज भने मात्र प्रयोग गर्नुहोस्। कुल ब्याज सुरुमै थाहा हुन्छ। पूर्णांकपछि पनि सावा शून्य होस् भन्न अन्तिम पङ्क्ति समायोजन हुन्छ।",
      ],
    }
  )
);
opt(
  "opt:interestMethod:simple_interest",
  intro(
    {
      title: "Method: Simple Interest",
      paragraphs: [
        "Each period charges interest on the original principal for that period length (principal × annual rate × period in years), while principal is repaid in equal parts. Unlike reducing balance, outstanding principal does not reduce the interest base during the tenure.",
        "Suitable for simple contracts. EMI preview is principal part plus that period’s simple interest. Journals on Pay EMI still split principal versus interest onto liability and expense.",
      ],
    },
    {
      title: "विधि: साधारण ब्याज",
      paragraphs: [
        "हर अवधि मूल मूलधन पर उस अवधि की लंबाई का ब्याज लगाती है (मूलधन × वार्षिक दर × वर्षों में अवधि), जबकि मूलधन समान भागों में उतरता है। Reducing के विपरीत, बकाया मूलधन अवधि में ब्याज आधार नहीं घटाता।",
        "साधारण अनुबंध के लिए उपयुक्त। EMI पूर्वावलोकन मूलधन भाग + उस अवधि का साधारण ब्याज। Pay EMI पर जर्नल फिर भी देनदारी और खर्च पर मूलधन/ब्याज बाँटते हैं।",
      ],
    },
    {
      title: "विधि: साधारण ब्याज",
      paragraphs: [
        "प्रत्येक अवधिले मूल सावामा सो अवधिको लम्बाइको ब्याज लगाउँछ (सावा × वार्षिक दर × वर्षमा अवधि), जबकि सावा समान भागमा घट्छ। Reducing विपरीत, बाँकी सावाले अवधिमा ब्याज आधार घटाउँदैन।",
        "साधारण सम्झौताका लागि उपयुक्त। EMI पूर्वावलोकन सावा भाग + सो अवधिको साधारण ब्याज। Pay EMI मा जर्नल फेरि पनि दायित्व र खर्चमा सावा/ब्याज बाँड्छन्।",
      ],
    }
  )
);
opt(
  "opt:interestMethod:compound_interest",
  intro(
    {
      title: "Method: Compound Interest",
      paragraphs: [
        "Each period the outstanding is grown by (1 + periodic rate) first, so interest is added to the balance, then the installment is applied. The last installment clears what remains after compounding.",
        "Use when the contract compounds unpaid interest into principal before payment. Do not confuse with reducing EMI: reducing charges interest on outstanding but typically does not capitalise it as a separate compound step in the same way.",
      ],
    },
    {
      title: "विधि: चक्रवृद्धि ब्याज",
      paragraphs: [
        "हर अवधि में बकाया पहले (1 + आवधिक दर) से बढ़ता है, ब्याज शेष में जुड़ता है, फिर किस्त लगती है। अंतिम किस्त चक्रवृद्धि के बाद बचे को चुकती है।",
        "जब अनुबंध भुगतान से पहले न चुका ब्याज मूलधन में जोड़ता हो। Reducing EMI से भ्रमित न हों: reducing बकाया पर ब्याज लगाता है पर उसी तरह अलग चक्रवृद्धि चरण में पूँजीकरण नहीं करता।",
      ],
    },
    {
      title: "विधि: चक्रवृद्धि ब्याज",
      paragraphs: [
        "प्रत्येक अवधिमा बाँकी पहिले (१ + आवधिक दर) ले बढ्छ, ब्याज मौज्दातमा जोडिन्छ, अनि किस्ता लाग्छ। अन्तिम किस्ता चक्रवृद्धिपछि बाँकी चुक्ता गर्छ।",
        "सम्झौताले भुक्तानीअघि नतिरेको ब्याज सावामा जोड्दा प्रयोग गर्नुहोस्। Reducing EMI सँग नभुलिनुहोस्: reducing ले बाँकीमा ब्याज लगाउँछ तर उही तरिकाले छुट्टै चक्रवृद्धि चरणमा पूँजीकरण गर्दैन।",
      ],
    }
  )
);
opt(
  "opt:interestMethod:daily_reducing_balance",
  intro(
    {
      title: "Method: Daily Reducing Balance",
      paragraphs: [
        "Interest between two dates = outstanding principal × annual rate × actual days / Day Basis (365, 366, or 360). First period uses days from Disbursement Date to First Payment Date (at least one day). Then EMI (or last remaining principal) splits interest and principal.",
        "Use when the bank charges on actual/actual or actual/360. Month lengths and leap days therefore change rupee interest even if the EMI rupee is kept similar.",
      ],
    },
    {
      title: "विधि: दैनिक घटता शेष",
      paragraphs: [
        "दो तिथियों के बीच ब्याज = बकाया मूलधन × वार्षिक दर × वास्तविक दिन / Day Basis (365, 366 या 360)। पहली अवधि डिस्बर्सल से पहली EMI तक के दिन (कम से कम एक)। फिर EMI (या अंतिम शेष मूलधन) ब्याज और मूलधन बाँटती है।",
        "जब बैंक actual/actual या actual/360 लगाए। महीने की लंबाई और लीप दिन रुपया ब्याज बदलते हैं भले EMI रुपया समान हो।",
      ],
    },
    {
      title: "विधि: दैनिक घट्दो मौज्दात",
      paragraphs: [
        "दुई मितिबीच ब्याज = बाँकी सावा × वार्षिक दर × वास्तविक दिन / Day Basis (३६५, ३६६ वा ३६०)। पहिलो अवधि डिस्बर्सलदेखि पहिलो EMI सम्मका दिन (कम्तीमा एक)। अनि EMI (वा अन्तिम बाँकी सावा) ले ब्याज र सावा बाँड्छ।",
        "बैंकले actual/actual वा actual/360 लगाए प्रयोग गर्नुहोस्। महिनाको लम्बाइ र लीप दिनले रुपैयाँ ब्याज बदल्छन् EMI रुपैयाँ उस्तै भए पनि।",
      ],
    }
  )
);

opt(
  "opt:interestRateType:fixed",
  intro(
    { title: "Rate type: Fixed", paragraphs: ["The saved rate remains the calculation rate until someone uses Change Interest Rate with a reason. Suitable when the sanction freezes the coupon. History still records the opening rate on create."] },
    { title: "दर प्रकार: निश्चित", paragraphs: ["सेव दर तब तक गणना दर रहती है जब तक कोई कारण सहित Change Interest Rate न करे। जब स्वीकृति कूपन बाँधे। निर्माण पर प्रारंभिक दर इतिहास में फिर भी लिखी जाती है।"] },
    { title: "दर प्रकार: स्थिर", paragraphs: ["सेभ दर तबसम्म गणना दर रहन्छ जबसम्म कसैले कारणसहित Change Interest Rate गर्दैन। स्वीकृतिले कूपन बाँधे उपयुक्त। निर्माणमा सुरुको दर इतिहासमा फेरि पनि लेखिन्छ।"] }
  )
);
opt(
  "opt:interestRateType:floating",
  intro(
    { title: "Rate type: Floating", paragraphs: ["Signals that rates will be revised. Each revision stores old rate, new rate, effective date, and reason. Only future unpaid schedule rows are rebuilt. Posted EMI journals stay as they were."] },
    { title: "दर प्रकार: परिवर्तनशील", paragraphs: ["संकेत कि दरें संशोधित होंगी। हर संशोधन पुरानी दर, नई दर, प्रभावी तिथि और कारण रखता है। केवल भविष्य की न चुकाई पंक्तियाँ फिर बनती हैं। पोस्ट EMI जर्नल जैसे थे वैसे रहते हैं।"] },
    { title: "दर प्रकार: परिवर्तनशील", paragraphs: ["सङ्केत कि दर संशोधन हुनेछन्। प्रत्येक संशोधनले पुरानो दर, नयाँ दर, प्रभावी मिति र कारण राख्छ। केवल भविष्यका नतिरेका पङ्क्ति फेरि बन्छन्। पोस्ट EMI जर्नल जस्ता थिए त्यस्तै रहन्छन्।"] }
  )
);

opt(
  "opt:tenureUnit:months",
  intro(
    { title: "Tenure unit: Months", paragraphs: ["Tenure number is months. 60 with monthly frequency → 60 installments. 60 with quarterly frequency → 20 installments (60÷3)."] },
    { title: "अवधि इकाई: महीने", paragraphs: ["Tenure संख्या महीने हैं। 60 मासिक आवृत्ति → 60 किस्त। 60 तिमाही → 20 किस्त (60÷3)।"] },
    { title: "अवधि इकाई: महिना", paragraphs: ["Tenure संख्या महिना हुन्। ६० मासिक आवृत्ति → ६० किस्ता। ६० त्रैमासिक → २० किस्ता (६०÷३)।"] }
  )
);
opt(
  "opt:tenureUnit:years",
  intro(
    { title: "Tenure unit: Years", paragraphs: ["Tenure number is years, converted internally to months (×12) before dividing by the frequency step. 5 years monthly → 60 EMIs."] },
    { title: "अवधि इकाई: वर्ष", paragraphs: ["Tenure संख्या वर्ष हैं, भीतर महीनों में (×12) फिर आवृत्ति चरण से भाग। 5 वर्ष मासिक → 60 EMI।"] },
    { title: "अवधि इकाई: वर्ष", paragraphs: ["Tenure संख्या वर्ष हुन्, भित्र महिनामा (×१२) अनि आवृत्ति चरणले भाग। ५ वर्ष मासिक → ६० EMI।"] }
  )
);

opt(
  "opt:paymentFrequency:monthly",
  intro(
    { title: "Frequency: Monthly", paragraphs: ["One installment every month. Periodic rate = annual rate / 12. Due dates add one calendar month from the first payment date with day clamping. Standard for bank EMI."] },
    { title: "आवृत्ति: मासिक", paragraphs: ["हर महीने एक किस्त। आवधिक दर = वार्षिक / 12। देय तिथियाँ पहली भुगतान से एक कैलेंडर महीना जोड़ती हैं, दिन clamp के साथ। बैंक EMI के लिए मानक।"] },
    { title: "आवृत्ति: मासिक", paragraphs: ["हरेक महिना एक किस्ता। आवधिक दर = वार्षिक / १२। देय मिति पहिलो भुक्तानीबाट एक पात्रो महिना जोडिन्छन्, दिन clamp सहित। बैंक EMI का लागि मानक।"] }
  )
);
opt(
  "opt:paymentFrequency:quarterly",
  intro(
    { title: "Frequency: Quarterly", paragraphs: ["Installment every three months. Periodic rate = annual / 4. Fewer rows than monthly for the same tenure in years."] },
    { title: "आवृत्ति: तिमाही", paragraphs: ["हर तीन महीने किस्त। आवधिक दर = वार्षिक / 4। वर्षों की समान अवधि में मासिक से कम पंक्तियाँ।"] },
    { title: "आवृत्ति: त्रैमासिक", paragraphs: ["हर तीन महिना किस्ता। आवधिक दर = वार्षिक / ४। वर्षको उही अवधिमा मासिकभन्दा कम पङ्क्ति।"] }
  )
);
opt(
  "opt:paymentFrequency:half_yearly",
  intro(
    { title: "Frequency: Half-yearly", paragraphs: ["Installment every six months. Periodic rate = annual / 2. Used for some institutional loans."] },
    { title: "आवृत्ति: अर्धवार्षिक", paragraphs: ["हर छह महीने किस्त। आवधिक दर = वार्षिक / 2। कुछ संस्थागत लोन में।"] },
    { title: "आवृत्ति: अर्धवार्षिक", paragraphs: ["हर छ महिना किस्ता। आवधिक दर = वार्षिक / २। केही संस्थागत ऋणमा।"] }
  )
);
opt(
  "opt:paymentFrequency:yearly",
  intro(
    { title: "Frequency: Yearly", paragraphs: ["One installment per year. Periodic rate equals the annual rate. Due dates add twelve months each time."] },
    { title: "आवृत्ति: वार्षिक", paragraphs: ["वर्ष में एक किस्त। आवधिक दर वार्षिक दर के बराबर। देय तिथियाँ हर बार बारह महीने जोड़ती हैं।"] },
    { title: "आवृत्ति: वार्षिक", paragraphs: ["वर्षमा एक किस्ता। आवधिक दर वार्षिक दर बराबर। देय मिति हरेक पटक बाह्र महिना जोडिन्छन्।"] }
  )
);
opt(
  "opt:paymentFrequency:custom",
  intro(
    { title: "Frequency: Custom", paragraphs: ["Uses Custom interval months (minimum 1). Periodic rate uses 12 / interval as periods per year when converting the annual rate. For unusual cycles only."] },
    { title: "आवृत्ति: कस्टम", paragraphs: ["कस्टम अंतराल महीने (न्यूनतम 1)। आवधिक दर में वर्ष की अवधि 12 / अंतराल मानी जाती है। असामान्य चक्र के लिए।"] },
    { title: "आवृत्ति: कस्टम", paragraphs: ["कस्टम अन्तराल महिना (न्यूनतम १)। आवधिक दरमा वर्षको अवधि १२ / अन्तराल मानिन्छ। असामान्य चक्रका लागि।"] }
  )
);

opt(
  "opt:paymentDayMode:same_day",
  intro(
    { title: "Payment day: Same day of month", paragraphs: ["Keeps the day-of-month from First Payment Date. If that day does not exist (31 in April, 30 in February), the last day of that month is used. Leap February 29 is used in leap years."] },
    { title: "भुगतान दिन: महीने का वही दिन", paragraphs: ["First Payment Date वाला दिन रखता है। वह दिन न हो (अप्रैल में 31, फरवरी में 30) तो उस महीने का अंतिम दिन। लीप वर्ष में 29 फरवरी।"] },
    { title: "भुक्तानी दिन: महिनाको सोही दिन", paragraphs: ["First Payment Date को दिन राख्छ। त्यो दिन नभए (अप्रिलमा ३१, फेब्रुअरीमा ३०) सो महिनाको अन्तिम दिन। लीप वर्षमा २९ फेब्रुअरी।"] }
  )
);
opt(
  "opt:paymentDayMode:month_end",
  intro(
    { title: "Payment day: Month end", paragraphs: ["Every due date is the last calendar day of its month (28, 29, 30, or 31). Independent of the first payment’s day-of-month except that generation still starts at First Payment Date’s month sequence."] },
    { title: "भुगतान दिन: माह का अंत", paragraphs: ["हर देय उस महीने का अंतिम कैलेंडर दिन (28, 29, 30 या 31)। पहली EMI के दिन से स्वतंत्र, पर श्रृंखला First Payment Date के महीने से शुरू।"] },
    { title: "भुक्तानी दिन: महिनाको अन्त्य", paragraphs: ["हर देय सो महिनाको अन्तिम पात्रो दिन (२८, २९, ३० वा ३१)। पहिलो EMI को दिनबाट स्वतन्त्र, तर शृङ्खला First Payment Date को महिनाबाट सुरु।"] }
  )
);
opt(
  "opt:paymentDayMode:custom_day",
  intro(
    { title: "Payment day: Custom day", paragraphs: ["Uses the Custom Day number (1–31) for every month, clamped to month length. Example: day 31 becomes 30 September and 28 February in a common year."] },
    { title: "भुगतान दिन: कस्टम दिन", paragraphs: ["हर महीने Custom Day (1–31), महीने की लंबाई तक घटाया। उदाहरण: दिन 31 सितंबर में 30 और सामान्य वर्ष की फरवरी में 28।"] },
    { title: "भुक्तानी दिन: कस्टम दिन", paragraphs: ["हरेक महिना Custom Day (१–३१), महिनाको लम्बाइसम्म घटाइन्छ। उदाहरण: दिन ३१ सेप्टेम्बरमा ३० र सामान्य वर्षको फेब्रुअरीमा २८।"] }
  )
);

opt(
  "opt:dayBasis:365",
  intro(
    { title: "Day basis: 365", paragraphs: ["Ordinary year of 365 days for daily interest. Daily reducing: divide by 365. Common for actual/365 contracts. Does not force every other method to use 365 internally for monthly EMI."] },
    { title: "दिन आधार: 365", paragraphs: ["दैनिक ब्याज के लिए सामान्य 365 दिन का वर्ष। Daily reducing: 365 से भाग। actual/365 अनुबंध में आम। मासिक EMI की अन्य विधियों को भीतर 365 पर मजबूर नहीं करता।"] },
    { title: "दिन आधार: ३६५", paragraphs: ["दैनिक ब्याजका लागि सामान्य ३६५ दिनको वर्ष। Daily reducing: ३६५ ले भाग। actual/365 सम्झौतामा सामान्य। मासिक EMI का अन्य विधिलाई भित्र ३६५ मा बाध्य गर्दैन।"] }
  )
);
opt(
  "opt:dayBasis:366",
  intro(
    { title: "Day basis: 366", paragraphs: ["Leap-year length. Daily interest divides by 366. Use when the contract says actual/366 or leap-year day count."] },
    { title: "दिन आधार: 366", paragraphs: ["लीप वर्ष लंबाई। दैनिक ब्याज 366 से भाग। अनुबंध actual/366 या लीप दिन गणना कहे तो।"] },
    { title: "दिन आधार: ३६६", paragraphs: ["लीप वर्ष लम्बाइ। दैनिक ब्याज ३६६ ले भाग। सम्झौता actual/366 वा लीप दिन गणना भने।"] }
  )
);
opt(
  "opt:dayBasis:360",
  intro(
    { title: "Day basis: 360", paragraphs: ["Commercial 360-day year. Daily interest divides by 360, which yields slightly higher rupee interest than 365 for the same days. Used in some money-market style contracts."] },
    { title: "दिन आधार: 360", paragraphs: ["वाणिज्यिक 360 दिन का वर्ष। दैनिक ब्याज 360 से भाग, समान दिनों पर 365 से थोड़ा अधिक रुपया ब्याज। कुछ मुद्रा-बाज़ार शैली अनुबंधों में।"] },
    { title: "दिन आधार: ३६०", paragraphs: ["व्यावसायिक ३६० दिनको वर्ष। दैनिक ब्याज ३६० ले भाग, उही दिनमा ३६५ भन्दा अलि बढी रुपैयाँ ब्याज। केही मुद्रा-बजार शैली सम्झौतामा।"] }
  )
);

opt(
  "opt:lateFeeMode:none",
  intro(
    { title: "Late fee: None", paragraphs: ["No late fee is computed. Overdue status still appears after grace. Pay EMI will not add a late-fee expense line unless you change mode later."] },
    { title: "विलंब शुल्क: नहीं", paragraphs: ["लेट फी गणना नहीं। ग्रेस बाद Overdue फिर भी दिख सकता है। मोड बाद में बदले बिना Pay EMI लेट-फी खर्च पंक्ति नहीं जोड़ता।"] },
    { title: "ढिलो शुल्क: छैन", paragraphs: ["ढिलो शुल्क गणना हुँदैन। ग्रेसपछि Overdue फेरि पनि देखिन सक्छ। मोड पछि नबदली Pay EMI ले ढिलो-शुल्क खर्च पङ्क्ति थप्दैन।"] }
  )
);
opt(
  "opt:lateFeeMode:fixed",
  intro(
    { title: "Late fee: Fixed amount", paragraphs: ["When overdue, late fee = Late Fee Value rupees, regardless of how large the EMI is. Posted only if included on payment or auto-post is on: Debit late-fee expense, Credit bank."] },
    { title: "विलंब शुल्क: निश्चित राशि", paragraphs: ["अतिदेय पर लेट फी = Late Fee Value रुपये, EMI कितनी भी हो। भुगतान पर शामिल या auto-post हो तभी पोस्ट: डेबिट लेट-फी खर्च, क्रेडिट बैंक।"] },
    { title: "ढिलो शुल्क: निश्चित रकम", paragraphs: ["अतिदेयमा ढिलो शुल्क = Late Fee Value रुपैयाँ, EMI जतिसुकै होस्। भुक्तानीमा समावेश वा auto-post भए मात्र पोस्ट: डेबिट ढिलो-शुल्क खर्च, क्रेडिट बैंक।"] }
  )
);
opt(
  "opt:lateFeeMode:percent",
  intro(
    { title: "Late fee: Percentage", paragraphs: ["Late fee = overdue remaining × (Late Fee Value / 100). Example 2 on 107,000 remaining → 2,140. Still not posted until payment includes it or auto-post runs."] },
    { title: "विलंब शुल्क: प्रतिशत", paragraphs: ["लेट फी = शेष अतिदेय × (Late Fee Value / 100)। उदाहरण 2 और शेष 107,000 → 2,140। भुगतान में शामिल या auto-post तक पोस्ट नहीं।"] },
    { title: "ढिलो शुल्क: प्रतिशत", paragraphs: ["ढिलो शुल्क = बाँकी अतिदेय × (Late Fee Value / १००)। उदाहरण २ र बाँकी १०७,००० → २,१४०। भुक्तानीमा समावेश वा auto-post सम्म पोस्ट हुँदैन।"] }
  )
);
opt(
  "opt:lateFeeMode:daily_percent",
  intro(
    { title: "Late fee: Daily percentage", paragraphs: ["Late fee = overdue remaining × (Late Fee Value / 100) × days overdue after grace. Example 0.05% per day. Grows with delay. Same posting rule: not silent nightly journals unless auto-post is enabled."] },
    { title: "विलंब शुल्क: दैनिक प्रतिशत", paragraphs: ["लेट फी = शेष अतिदेय × (Late Fee Value / 100) × ग्रेस बाद अतिदेय दिन। उदाहरण 0.05% प्रति दिन। देरी से बढ़ता है। वही पोस्ट नियम: auto-post बिना रात को चुप जर्नल नहीं।"] },
    { title: "ढिलो शुल्क: दैनिक प्रतिशत", paragraphs: ["ढिलो शुल्क = बाँकी अतिदेय × (Late Fee Value / १००) × ग्रेसपछिका अतिदेय दिन। उदाहरण ०.०५% प्रति दिन। ढिलाइसँग बढ्छ। उही पोस्ट नियम: auto-post बिना रातमा चुप जर्नल हुँदैन।"] }
  )
);

opt(
  "opt:loanAccount:__create__",
  intro(
    { title: "Create new loan liability", paragraphs: ["On Save Loan, Pocket Ledger looks for a Staff account with the loan name under Loans & Liabilities. If none, it creates one. That account is credited on disbursement and debited on principal repayment."] },
    { title: "नई लोन देनदारी बनाएँ", paragraphs: ["Save Loan पर Pocket Ledger Loans & Liabilities में लोन नाम का स्टाफ खोजता है। न हो तो बनाता है। डिस्बर्सल पर क्रेडिट, मूलधन चुकौती पर डेबिट।"] },
    { title: "नयाँ ऋण दायित्व बनाउनुहोस्", paragraphs: ["Save Loan मा Pocket Ledger ले Loans & Liabilities मा ऋण नामको स्टाफ खोज्छ। नभए बनाउँछ। डिस्बर्सलमा क्रेडिट, सावा भुक्तानीमा डेबिट।"] }
  )
);
opt(
  "opt:interestAccount:__create__",
  intro(
    { title: "Create new interest expense", paragraphs: ["Creates or reuses “Loan Interest” under Finance Costs (group created if missing). EMI interest Debit goes here."] },
    { title: "नया ब्याज खर्च बनाएँ", paragraphs: ["Finance Costs में “Loan Interest” बनाता या पुनः उपयोग (समूह न हो तो बनता है)। EMI ब्याज डेबिट यहीं।"] },
    { title: "नयाँ ब्याज खर्च बनाउनुहोस्", paragraphs: ["Finance Costs मा “Loan Interest” बनाउँछ वा पुनः प्रयोग (समूह नभए बन्छ)। EMI ब्याज डेबिट यहीँ।"] }
  )
);
opt(
  "opt:feeAccount:__auto__",
  intro(
    { title: "Auto-create fee account if missing", paragraphs: ["If you do not pick an existing expense, Save creates the standard processing or late-fee name under Finance Costs when that name is absent. No duplicate if the name already exists."] },
    { title: "न हो तो शुल्क खाता स्वतः बनाएँ", paragraphs: ["मौजूदा खर्च न चुनें तो सेव पर Finance Costs में मानक प्रोसेसिंग या लेट-फी नाम बनता है यदि वह नाम न हो। नाम पहले हो तो डुप्लिकेट नहीं।"] },
    { title: "नभए शुल्क खाता आफैं बनाउने", paragraphs: ["विद्यमान खर्च नछाने सेभमा Finance Costs मा मानक प्रोसेसिङ वा ढिलो-शुल्क नाम बन्छ यदि त्यो नाम छैन। नाम पहिले भए नक्कल हुँदैन।"] }
  )
);

opt(
  "customIntervalMonths",
  intro(
    {
      title: "Custom interval (months)",
      paragraphs: [
        "This number is used only when Payment Frequency is Custom. It is the gap in whole months between two installments. 1 means monthly, 2 means every two months, 3 means quarterly-style, and so on. The engine converts the annual interest rate using 12 ÷ this interval as the number of periods in a year.",
        "Minimum is 1. Do not enter days or weeks here — only months. Due dates then add this many calendar months from the first payment date, with the same day-of-month rules you chose under Payment Day.",
        "If you meant a standard monthly, quarterly, half-yearly, or yearly cycle, switch Payment Frequency back to that named option instead of Custom. Named options are easier to audit on reports.",
      ],
    },
    {
      title: "कस्टम अंतराल (महीने)",
      paragraphs: [
        "यह संख्या तभी लगती है जब Payment Frequency Custom हो। दो किस्तों के बीच पूरे महीनों का अंतर है। 1 = मासिक, 2 = हर दो महीने, 3 = तिमाही जैसा। इंजन वार्षिक ब्याज दर को 12 ÷ यह अंतराल को वर्ष की अवधियाँ मानकर बदलता है।",
        "न्यूनतम 1। यहाँ दिन या सप्ताह न लिखें — केवल महीने। देय तिथियाँ पहली भुगतान से इतने कैलेंडर महीने जोड़ती हैं, Payment Day वाले दिन-नियमों के साथ।",
        "यदि मानक मासिक, तिमाही, अर्धवार्षिक या वार्षिक चक्र चाहिए तो Custom छोड़कर वह नामित आवृत्ति चुनें। रिपोर्ट पर ऑडिट आसान रहता है।",
      ],
    },
    {
      title: "कस्टम अन्तराल (महिना)",
      paragraphs: [
        "यो संख्या तब मात्र लाग्छ जब Payment Frequency Custom हो। दुई किस्ताबीच पूरा महिनाको अन्तर हो। १ = मासिक, २ = हरेक दुई महिना, ३ = त्रैमासिकजस्तो। इन्जिनले वार्षिक ब्याज दरलाई १२ ÷ यो अन्तराललाई वर्षका अवधि मानेर बदल्छ।",
        "न्यूनतम १। यहाँ दिन वा हप्ता नलेख्नुहोस् — केवल महिना। देय मिति पहिलो भुक्तानीबाट यति पात्रो महिना जोडिन्छन्, Payment Day का दिन-नियमसहित।",
        "यदि मानक मासिक, त्रैमासिक, अर्धवार्षिक वा वार्षिक चक्र चाहियो भने Custom छाडी सो नामित आवृत्ति छान्नुहोस्। रिपोर्टमा अडिट सजिलो रहन्छ।",
      ],
    }
  )
);

opt(
  "compoundingFrequency",
  intro(
    {
      title: "Compounding frequency",
      paragraphs: [
        "Shown when Interest Method is Compound Interest. It is how often unpaid interest is added into the outstanding before the installment is applied. Monthly compounding twelve times a year is the usual default and should match the sanction letter.",
        "If the letter compounds quarterly or yearly, choose that frequency here. This is separate from Payment Frequency: you can repay monthly while interest compounds quarterly, if that is the contract. Mismatching the letter will make EMI and total interest disagree with the bank statement.",
        "After you change this value, click Calculate Schedule again. Posted journals are not rewritten; only the preview and, on Save Loan, the new loan’s schedule use the new compounding step.",
      ],
    },
    {
      title: "चक्रवृद्धि आवृत्ति",
      paragraphs: [
        "जब Interest Method चक्रवृद्धि ब्याज हो तब दिखता है। किस्त लगाने से पहले न चुका ब्याज कितनी बार बकाया में जुड़ता है। मासिक चक्रवृद्धि वर्ष में बारह बार सामान्य डिफ़ॉल्ट है और स्वीकृति पत्र से मेल खाना चाहिए।",
        "पत्र तिमाही या वार्षिक चक्रवृद्धि कहे तो वही चुनें। यह Payment Frequency से अलग है: अनुबंध हो तो मासिक चुकौती और तिमाही चक्रवृद्धि साथ चल सकती है। पत्र से मेल न हो तो EMI और कुल ब्याज बैंक स्टेटमेंट से नहीं बैठेंगे।",
        "यह मान बदलने के बाद Calculate Schedule फिर दबाएँ। पोस्ट जर्नल नहीं बदलते; पूर्वावलोकन और Save Loan पर नए लोन की तालिका नया चक्रवृद्धि चरण इस्तेमाल करती है।",
      ],
    },
    {
      title: "चक्रवृद्धि आवृत्ति",
      paragraphs: [
        "Interest Method चक्रवृद्धि ब्याज हुँदा देखिन्छ। किस्ता लगाउनुअघि नतिरेको ब्याज कति पटक बाँकीमा जोडिन्छ। मासिक चक्रवृद्धि वर्षमा बाह्र पटक सामान्य डिफल्ट हो र स्वीकृति पत्रसँग मिल्नुपर्छ।",
        "पत्रले त्रैमासिक वा वार्षिक चक्रवृद्धि भने सोही छान्नुहोस्। यो Payment Frequency बाट छुट्टै हो: सम्झौता भए मासिक भुक्तानी र त्रैमासिक चक्रवृद्धि सँगै चल्न सक्छ। पत्रसँग नमिले EMI र कुल ब्याज बैंक स्टेटमेन्टसँग मिल्दैन।",
        "यो मान बदलेपछि Calculate Schedule फेरि थिच्नुहोस्। पोस्ट जर्नल बदलिँदैनन्; पूर्वावलोकन र Save Loan मा नयाँ ऋणको तालिकाले नयाँ चक्रवृद्धि चरण प्रयोग गर्छ।",
      ],
    }
  )
);

opt(
  "opt:bankAccount:picked",
  intro(
    {
      title: "Selected Bank / Cash account",
      paragraphs: [
        "This is the money ledger that will receive the disbursement (Debit Bank/Cash, Credit Loan Liability) and that will be credited when you pay EMI, charges, or prepayment. It stays a Bank or Cash master. Existing receipts and payments already posted on this account are not moved.",
        "If you reached this choice through Add Existing Account, the same bank is linked to a separate Loans & Liabilities staff account. Always pay the lender from this bank in the Loan module so the schedule, outstanding, and cash book stay aligned.",
        "Pick a different Bank/Cash only if the sanction credits another account. Do not pick the loan liability staff account here — that belongs in Loan Liability Account.",
      ],
    },
    {
      title: "चुना हुआ बैंक / नकद खाता",
      paragraphs: [
        "यह धन खाता डिस्बर्सल लेता है (डेबिट बैंक/नकद, क्रेडिट लोन देनदारी) और EMI, शुल्क या पूर्व भुगतान पर क्रेडिट होता है। यह बैंक या कैश मास्टर रहता है। इस खाते पर पहले पोस्ट रसीद-भुगतान नहीं हिलते।",
        "यदि Add Existing Account से आए हैं तो वही बैंक अलग Loans & Liabilities स्टाफ से जुड़ा है। ऋणदाता को लोन मॉड्यूल से इसी बैंक से चुकाएँ ताकि शेड्यूल, बकाया और रोकड़ बही एक रहें।",
        "स्वीकृति किसी अन्य खाते में जमा कहे तभी दूसरा बैंक/नकद चुनें। यहाँ लोन देनदारी स्टाफ न चुनें — वह Loan Liability Account में है।",
      ],
    },
    {
      title: "चयनित बैंक / नगद खाता",
      paragraphs: [
        "यो पैसा खाताले डिस्बर्सल लिन्छ (डेबिट बैंक/नगद, क्रेडिट ऋण दायित्व) र EMI, शुल्क वा अग्रिम भुक्तानीमा क्रेडिट हुन्छ। यो बैंक वा नगद मास्टर रहन्छ। यस खातामा पहिले पोस्ट रसिद-भुक्तानी सर्दैनन्।",
        "Add Existing Account बाट आउनुभएको हो भने सोही बैंक छुट्टै Loans & Liabilities स्टाफसँग जोडिएको हुन्छ। ऋणदातालाई ऋण मोड्युलबाट यही बैंकबाट तिर्नुहोस् ताकि तालिका, बाँकी र नगद बही एउटै रहून्।",
        "स्वीकृतिले अर्को खातामा जम्मा भने मात्र अर्को बैंक/नगद छान्नुहोस्। यहाँ ऋण दायित्व स्टाफ नछान्नुहोस् — त्यो Loan Liability Account मा छ।",
      ],
    }
  )
);

opt(
  "opt:loanAccount:picked",
  intro(
    {
      title: "Selected loan liability account",
      paragraphs: [
        "This Staff ledger under Loans & Liabilities is the payable for this loan. Disbursement credits it (your company owes more). Each EMI’s principal portion debits it (you owe less). Interest does not live on this account — interest goes to the interest expense account.",
        "If this row came from Add Existing Account, it was created or reused from the bank you converted and linked on that bank’s master. Reusing it on another loan would mix two facilities on one liability — only do that if they are truly one sanction.",
        "Balance on this staff account after posting should match outstanding principal (plus any charges you chose to put on the liability). Compare Loan Overview outstanding with the Staff ledger if you audit.",
      ],
    },
    {
      title: "चुना हुआ लोन देनदारी खाता",
      paragraphs: [
        "Loans & Liabilities के अंतर्गत यह स्टाफ लेजर इस लोन की देनदारी है। डिस्बर्सल इसे क्रेडिट करता है (कंपनी पर कर्ज बढ़ता है)। हर EMI का मूलधन हिस्सा डेबिट करता है (कर्ज घटता है)। ब्याज इस खाते पर नहीं — ब्याज खर्च खाते पर जाता है।",
        "यदि Add Existing Account से आया है तो जिस बैंक को कनवर्ट किया उसी से बना/जुड़ा है। दूसरे लोन पर पुनः उपयोग दो सुविधाओं को एक देनदारी पर मिला देगा — तभी करें जब सच में एक स्वीकृति हो।",
        "पोस्ट के बाद इस स्टाफ का शेष बकाया मूलधन (और देनदारी पर डाले शुल्क) से मेल खाना चाहिए। ऑडिट में Loan Overview बकाया और स्टाफ लेजर मिलाएँ।",
      ],
    },
    {
      title: "चयनित ऋण दायित्व खाता",
      paragraphs: [
        "Loans & Liabilities अन्तर्गत यो स्टाफ लेजर यस ऋणको तिर्नुपर्ने दायित्व हो। डिस्बर्सलले क्रेडिट गर्छ (कम्पनीमा ऋण बढ्छ)। हरेक EMI को सावा भागले डेबिट गर्छ (ऋण घट्छ)। ब्याज यस खातामा बस्दैन — ब्याज खर्च खातामा जान्छ।",
        "Add Existing Account बाट आएको हो भने कन्भर्ट गरिएको बैंकबाट बन्यो/जोडियो। अर्को ऋणमा पुनः प्रयोगले दुई सुविधालाई एक दायित्वमा मिसाउँछ — साँच्चै एक स्वीकृति हो भने मात्र।",
        "पोस्टपछि यस स्टाफको मौज्दात बाँकी सावा (र दायित्वमा राखिएका शुल्क) सँग मिल्नुपर्छ। अडिटमा Loan Overview बाँकी र स्टाफ लेजर मिलाउनुहोस्।",
      ],
    }
  )
);

opt(
  "opt:interestAccount:picked",
  intro(
    {
      title: "Selected interest expense account",
      paragraphs: [
        "This Income & Expense ledger receives Debit when EMI interest (or accrued interest you post) is recognised. Credit is not applied here for a normal EMI — the Credit is the Bank/Cash you pay from.",
        "Using an existing expense is correct when your accountant already created “Bank Interest” or “Finance Charges”. Profit & Loss then follows that name. Do not pick a Bank or Staff account; interest is an expense, not a liability or cash movement by itself.",
        "If several loans share one interest account, P&L shows combined finance cost. Use separate expense names only when you need product-wise interest in reports.",
      ],
    },
    {
      title: "चुना हुआ ब्याज खर्च खाता",
      paragraphs: [
        "यह आय-व्यय खाता EMI ब्याज (या पोस्ट किया अर्जित ब्याज) पहचानने पर डेबिट होता है। सामान्य EMI पर यहाँ क्रेडिट नहीं — क्रेडिट उस बैंक/नकद पर है जहाँ से भुगतान होता है।",
        "एकाउंटेंट पहले से “Bank Interest” या “Finance Charges” बना चुका हो तो वही चुनना सही है। लाभ-हानि उसी नाम से चलती है। बैंक या स्टाफ न चुनें; ब्याज खर्च है, स्वयं देनदारी या रोकड़ नहीं।",
        "कई लोन एक ब्याज खाता बाँटें तो P&L संयुक्त वित्त लागत दिखाता है। उत्पाद-वार ब्याज चाहिए तभी अलग खर्च नाम रखें।",
      ],
    },
    {
      title: "चयनित ब्याज खर्च खाता",
      paragraphs: [
        "यो आय-व्यय खाता EMI ब्याज (वा पोस्ट गरिएको आर्जित ब्याज) पहिचान हुँदा डेबिट हुन्छ। सामान्य EMI मा यहाँ क्रेडिट हुँदैन — क्रेडिट त्यो बैंक/नगदमा हुन्छ जहाँबाट भुक्तानी हुन्छ।",
        "एकाउन्टेन्टले पहिले “Bank Interest” वा “Finance Charges” बनाएको भए सोही छान्नु सही हो। नाफा-नोक्सान सोही नामबाट चल्छ। बैंक वा स्टाफ नछान्नुहोस्; ब्याज खर्च हो, आफैं दायित्व वा नगद होइन।",
        "धेरै ऋणले एक ब्याज खाता बाँडे P&L ले संयुक्त वित्त लागत देखाउँछ। उत्पादन-अनुसार ब्याज चाहिँदा मात्र छुट्टै खर्च नाम राख्नुहोस्।",
      ],
    }
  )
);

opt(
  "opt:feeAccount:picked",
  intro(
    {
      title: "Selected fee / late-fee expense account",
      paragraphs: [
        "Processing fee and late fee are expenses, not reductions of the loan liability (unless you deliberately journal otherwise outside this module). Debit this expense and Credit Bank/Cash when the charge is paid.",
        "Choosing an existing expense keeps your chart tidy if “Bank charges” already exists. Late fee can share the same account as processing, but then P&L cannot separate penalty from onboarding cost — prefer the auto-created Late Payment Charges name when you want that split.",
        "Changing this later on a saved loan affects new charge postings only. Already posted charge vouchers keep their original expense account.",
      ],
    },
    {
      title: "चुना हुआ शुल्क / विलंब-शुल्क खर्च खाता",
      paragraphs: [
        "प्रोसेसिंग फी और लेट फी खर्च हैं, लोन देनदारी की कमी नहीं (जब तक मॉड्यूल के बाहर जानबूझकर अन्य जर्नल न हो)। शुल्क चुकाते समय इस खर्च को डेबिट और बैंक/नकद क्रेडिट।",
        "“Bank charges” पहले हो तो वही चुनकर चार्ट साफ रहता है। लेट फी प्रोसेसिंग से साझा हो सकती है, पर फिर P&L जुर्माना और ऑनबोर्डिंग अलग नहीं दिखाएगा — वह विभाजन चाहिए तो स्वतः Late Payment Charges नाम बेहतर है।",
        "सेव लोन पर बाद में बदलने से केवल नई शुल्क पोस्टिंग बदलती है। पहले पोस्ट वाउचर पुराने खर्च खाते पर रहते हैं।",
      ],
    },
    {
      title: "चयनित शुल्क / ढिलो-शुल्क खर्च खाता",
      paragraphs: [
        "प्रोसेसिङ शुल्क र ढिलो शुल्क खर्च हुन्, ऋण दायित्वको कमी होइनन् (मोड्युलबाहिर जानाजानी अर्को जर्नल नभएसम्म)। शुल्क तिर्दा यो खर्च डेबिट र बैंक/नगद क्रेडिट।",
        "“Bank charges” पहिले भए सोही छानेर चार्ट सफा रहन्छ। ढिलो शुल्क प्रोसेसिङसँग साझा हुन सक्छ, तर तब P&L ले जरिवाना र अनबोर्डिङ छुट्याउँदैन — त्यो विभाजन चाहियो भने आफैं बन्ने Late Payment Charges नाम राम्रो।",
        "सेभ ऋणमा पछि बदल्दा नयाँ शुल्क पोस्टिङ मात्र बदलिन्छ। पहिले पोस्ट भाउचर पुरानो खर्च खातामा रहन्छन्।",
      ],
    }
  )
);

export function getLoanFormIntro(key: string | undefined | null): LoanIntroSet | null {
  if (!key) return null;
  return LOAN_FORM_INTROS[key] ?? null;
}
