# Super Admin Setting र Plans – Build नियम र Offline मा Live Update

यो doc मा दुई कुरा छन्:  
(१) **कुनै पनि build मा super admin setting ननिकाल्ने** नियम।  
(२) **App builder ले plans र super admin setting** mobile / PC / tablet मा (खास गरेर **offline mode** मा) **कसरी apply गर्ने** र "live update" जस्तो कसरी दिने।

---

## १) कुनै पनि Build मा Super Admin Setting ननिकाल्ने

**नियम:** EXE, APK, iOS, Web, Linux – **कुनै पनि build** मा Super Admin सम्बन्धित setting, UI, वा logic हटाउनु हुँदैन।

- **Admin Panel** (`/admin`, plans, recycle bin, features, logs, आदि) सबै build मा **रहनुपर्छ**।  
- **Super admin emails** को source (env वा Firestore) र **`getSuperAdminEmails()` / `ensureSuperAdminInSharedEmails()`** जस्तो logic सबै build मा **include** गर्नुपर्छ।  
- Build गर्दा "admin only" भनेर route वा component strip गर्नु, वा env बाट super admin list हटाउनु **नगर्नुहोस्**।  
- Production / release build मा पनि admin access सिर्फ **role / email** ले control हुन्छ; code हटाउनु हुँदैन।

**कहाँ छ:**  
- Super admin list: `src/lib/superAdminEmails.ts` (env: `NEXT_PUBLIC_SUPER_ADMIN_EMAILS`), र Firestore `app_settings/admin_config` (superAdminEmails)।  
- Plans: `src/config/plans.ts` (DEFAULT_PLANS), र Firestore `app_settings/plans` (live plans)।  
- Admin UI: `src/app/(admin)/admin/` तथा `useAdminAccess(['SuperAdmin', ...])`।

---

## २) Live Update – Online मा कसरी काम गर्छ

जब **device online** छ (internet + Firebase/Firestore जोडिएको):

| के | कहाँबाट | के हुन्छ |
|----|----------|----------|
| **Plans** | Firestore `app_settings/plans` | Admin Panel → Plans बाट परिवर्तन गर्दा सबै connected app मा `useLivePlans()` ले तत्कालै नयाँ plans use गर्छ। |
| **Super admin list** | Firestore `app_settings/admin_config` (superAdminEmails) | Rules मा isAdmin() / isSuperAdminEmail() ले server-side check गर्छ। Client पनि जब online छ, admin config read गर्न सक्छ (admin-only)। |

त्यसैले **online** रहँदा app builder ले Admin Panel मा plans र super admin setting change गर्दा त्यो **सबै connected devices** मा लागु हुन्छ (कुनै नयाँ build वा app update पठाउनु पर्दैन)।

---

## ३) Offline Mode मा – Device मा Plans र Super Admin कसरी Apply गर्ने?

**समस्या:**  
Mobile, PC, वा tablet मा app **offline** छ भने Firestore सँग जोडिएको हुँदैन। त्यसैले "live" मा server बाट plans वा super admin setting पठाउन **सीधै सकिँदैन**।

**व्यावहारिक तरिकाहरू:**

### ३.१) जब device फेरि Online आउँछ (Sync on connect)

- App ले **पहिलो पटक online** हुँदा (वा पछि जब पनि internet मिल्छ) **Firestore** बाट लिने:
  - `app_settings/plans`
  - `app_settings/admin_config` (super admin emails, अगर client लाई पढ्न दिएको छ)
- यीलाई **local cache** (e.g. IndexedDB, AsyncStorage, SQLite) मा सेभ गर्ने।
- **Offline** मा चल्दा app ले **cache** बाट plans र (जहाँ लागू) super admin–related config use गर्छ।
- **App builder** ले के गर्छ: Admin Panel मा plans र super admin setting change गर्छ। जुन device पछि **एक पटक online** हुन्छ, त्यसले नयाँ config **sync** गरी लिन्छ र अर्को पटक offline मा पनि त्यही लागु हुन्छ।

**नोट:** "Live update" offline device मा **तत्काल** हुँदैन; **अर्को पटक connect** भएपछि apply हुन्छ।

### ३.२) नयाँ App Version (Build) पठाउनु

- Plans वा super admin को **default** value हरू **code / config** मा छन् (`config/plans.ts`, `superAdminEmails.ts` वा env)।
- यी बदलेर **नयाँ build** (नयाँ version) बनाउनुहोस् र user लाई **app update** गर्न लगाउनुहोस्।
- जस device मा update install हुन्छ, त्यहाँ नयाँ defaults लागु हुन्छ।  
- **Offline-only** device मा पनि update install गरेपछि नयाँ config आउँछ। तर यो "live" होइन – हरेक परिवर्तनको लागि नयाँ version release गर्नुपर्छ।

### ३.३) Optional: Config file वा URL (जटिल)

- Admin ले एक **config file** (e.g. JSON: plans + super admin list) export गर्छ।
- Device ले यो file **import** गर्छ (file share, SD card, वा जब online छ तब कुनै URL बाट download गर्छ)।
- App ले यो config **override** को रूपमा use गर्छ (cache जस्तै)।  
- यसको लागि app मा "Load config from file/URL" जस्तो feature बनाउनुपर्छ। यो सबै platform (EXE, APK, iOS) मा सुविधा अनुसार लागू गर्न सकिन्छ।

---

## ४) सारांश

| प्रश्न | जवाफ |
|--------|--------|
| कुनै build मा super admin setting निकाल्ने? | **ननिकाल्ने।** सबै build (EXE, APK, iOS, Web, Linux) मा admin panel र super admin logic रहनुपर्छ। |
| Online device मा plans / super admin कसरी apply? | Admin Panel मा change गर्नुहोस्। Firestore (`app_settings/plans`, `admin_config`) बाट सबै connected app मा live apply हुन्छ। |
| Offline device मा कसरी apply? | (१) **Sync on connect:** device जब online हुन्छ तब latest plans/admin config लिएर cache गर्छ; offline मा cache use। (२) **नयाँ build:** defaults code मा बदलेर नयाँ version release गर्नु। (३) Optional: config file/URL बाट load गर्ने feature। |
| "Live" update offline मा? | Offline रहँदा तत्काल push गर्न सकिँदैन। अर्को पटक device online भएपछि sync वा नयाँ app version बाट मात्र apply हुन्छ। |

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-APK.md](./BUILD-APK.md)
