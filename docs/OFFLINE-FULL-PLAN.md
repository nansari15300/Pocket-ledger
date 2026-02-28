# App Fully Offline काम गर्न के–के गर्नुपर्छ (ध्यानपूर्वक योजना)

## १. अहिले नै भएको कुरा (बदल्नु पर्दैन)

| कुरा | अवस्था |
|------|--------|
| **Firestore offline persistence** | `enableIndexedDbPersistence` ओन छ। अफलाइनमा read cache बाट, write queue मा जान्छ र पछि sync हुन्छ। |
| **Company create** | IndexedDB मा पहिले सिर्जना, पछि background मा Firestore sync। |
| **Firebase Auth** | User login state browser/IndexedDB मा persist हुन्छ – अफलाइनमा पनि “logged in” रहन सक्छ। |
| **Pending company guard** | जहाँ company doc update हुन्छ (Settings, Edit Company, etc.) त्यहाँ `isPendingSync` चेक र NOT_FOUND handling छ। |

---

## २. गर्नुपर्ने काम (ध्यानपूर्वक क्रममा)

### A. Offline indicator र UX

- [ ] **Offline banner/badge**  
  जब `navigator.onLine === false` होस्, एउटा सानो indicator देखाउनु (जस्तै: “You’re offline – changes will sync when back online”).  
  - यसले user लाई थाहा हुन्छ कि अफलाइनमा पनि सेभ गर्न सकिन्छ।

- [ ] **Error message नभएको**  
  जुन action Firestore ले queue गर्ने हो (addDoc/updateDoc/setDoc/deleteDoc), त्यसमा अफलाइनमा “Failed” नदेखाएर **“Saved. Will sync when you’re back online.”** जस्तो message देखाउनु।

---

### B. Firestore write वाला सबै form (बिना file upload)

यी सबैमा Firestore persistence ले नै write queue गर्छ। **पैटर्न:** company को data पहिले नै load/cache गर्ने (अनलाइनमा); अफलाइनमा **स्थानीय duplicate check** (getDocs नगरी parent/context को list बाट); नयाँ सेभ गर्दा addDoc (अफलाइनमा Firestore आफैं local ID ले queue गर्छ)।

- [x] **Create/Edit Group** (Party) – duplicate check अब `groups` prop बाट स्थानीय; getDocs हटाइयो। अफलाइनमा पनि सेभ हुन्छ।
- [ ] **Create/Edit Party**
- [ ] **Create/Edit Item, Item Group**
- [ ] **Create/Edit Bank/Cash Account, Account Group**
- [ ] **Create/Edit Staff, Staff Group**
- [ ] **Create/Edit Tax, Tax Group**
- [ ] **Create/Edit Expense Account/Group**
- [ ] **Voucher settings, Display settings, ID settings, Currency settings** (पहिले नै company guard छ)
- [ ] **Alarms / Messages** (जहाँ Firestore write छ)

**काम:**  
हरेक submit/save को `catch` मा:  
- अफलाइन हो भने (वा error “unavailable”/“failed-precondition” जस्तो) **“Saved locally. Will sync when back online.”** देखाउनु।  
- बाकी error मा मात्र “Failed to save” जस्तो देखाउनु।

---

### C. File upload भएका form (अफलाइनमा file नलिइनो वा queue)

अफलाइनमा **Storage (uploadBytes)** काम गर्दैन। त्यसैले यीमा नियम लागू गर्नुपर्छ:

| जहाँ file upload छ | अफलाइन नीति (एउटा चयन गर्नु) |
|---------------------|----------------------------------|
| Company logo (Create/Edit Company) | अफलाइनमा logo बिना सेभ (logoUrl = null); अनलाइनमा मात्र upload। *(Create company मा पहिले नै यस्तै।)* |
| Voucher attachments | **Payment Out** मा इम्प्लिमेन्ट: अफलाइनमा local ID + IndexedDB; अनलाइनमा syncPendingFiles() ले Storage मा upload गरेर Firestore मा URL राख्छ। बाँकी form मा यही pattern लगाउन सकिन्छ। |
| Tax file (Create/Edit Tax) | अफलाइनमा file बिना सेभ; पछि edit गरेर file थप्न सक्ने। |
| Bank/Account file (Create/Edit Account) | अफलाइनमा file बिना सेभ। |
| Distributor form (profile/docs) | अफलाइनमा disable वा “Come back online to submit.” |

**इम्प्लिमेन्ट:** `lib/offlineDb.ts` (pendingFiles store), `lib/localPendingFiles.ts` (putPendingFile, syncPendingFiles). useCompany को sync effect मा syncPendingFiles() चल्छ। बाँकी voucher/form मा पनि यही pattern (local ID → IndexedDB → अनलाइनमा upload) लगाउन सकिन्छ।

---

### D. Server actions (अफलाइनमा नचल्ने)

यी सब network माग्छन्। अफलाइनमा यी **disable वा स्पष्ट message** दिनुपर्छ:

| Action | प्रयोग | अफलाइनमा के गर्ने |
|--------|--------|---------------------|
| `initializeCompanyData` | नयाँ company sync पछि default accounts/parties बनाउन | अफलाइनमा sync नै हुँदैन; अनलाइन भएपछि sync effect बाट चल्छ – राख्न सकिन्छ। |
| `restoreCompany` (admin recycle bin) | Company restore | बटन disable वा “Available when online.” |
| `deleteCompanyComplete` | Permanent delete | बटन disable वा “Available when online.” |
| `actions.ts` को अरू server actions (handover, balance, etc.) | विभिन्न flows | जहाँ UI बाट call छ, त्यहाँ `navigator.onLine` चेक गरेर अफलाइनमा disable वा message। |

---

### E. Read path (पहिलो load अफलाइनमा)

- [ ] **Companies list**  
  `useCompany` मा Firestore `onSnapshot` + `getPendingCompanies()` – persistence ले cache दिन्छ; पहिले नै pending merge छ।  
  अफलाइनमा पनि cached companies + IndexedDB pending देखिन्छ।

- [ ] **Vouchers, Parties, Items, etc.**  
  सब Firestore query/onSnapshot – persistence ओन भएकोले अफलाइनमा **पहिले cache गरिएको** डाटा देखिन्छ।  
  जुन collection पहिले नै load भएको छ, त्यो अफलाइनमा देखिने; नभएको भने empty वा loading state।

- [ ] **Auth (`users/{uid}`)**  
  `onSnapshot(userDocRef)` – अफलाइनमा cache बाट आउन सक्छ।  
  यदि कहिलै “user doc not found” आयो भने, अफलाइनमा cached customUser नै प्रयोग गर्ने (बिना फेरि fetch)。

---

### F. Recycle bin / Delete flows

- [ ] **User recycle bin**  
  Move to bin = Firestore `updateDoc` (queue हुन्छ)।  
  Delete permanently = `movedToAdminRecycleAt` update वा server action – अफलाइनमा permanent delete **disable** गर्न सकिन्छ (“Available when online.”)。

- [ ] **Admin recycle bin**  
  Restore / Permanent delete सब server वा Firestore मा depend; अफलाइनमा बटन disable वा message।

---

### G. एकपटक implement गर्ने priority

1. **Offline indicator** (banner/badge) – सानो र सजिलो।  
2. **Firestore write error handling** – सबै “save” form मा अफलाइन/queue लागि “Saved. Will sync when back online.”  
3. **File upload वाला form** – अफलाइनमा file optional (बिना file सेभ); पहिले १–२ form (जस्तै voucher attachment) मा लगाएर बाँकीमा same pattern।  
4. **Server-action वाला बटन** – अफलाइनमा disable वा “Available when online.”  
5. **Recycle bin permanent delete / Admin restore** – अफलाइनमा disable।

---

## ३. छोटो सारांश

| Category | के गर्ने |
|----------|-----------|
| **Already OK** | Firestore persistence, Company create offline, Auth persist, Pending company guard |
| **Must do** | Offline indicator, सबै save form मा “will sync” error message, file upload अफलाइनमा optional |
| **Should do** | Server actions अफलाइनमा disable/message, recycle bin permanent/restore अफलाइनमा disable |
| **Optional (पछि)** | File upload queue (IndexedDB मा file राखेर पछि upload) |

यो योजना अनुसार काम गर्दा app **fully offline** (read cached data, write queued, file optional वा पछि sync) काम गर्न पुग्छ।  
पहिलो चोटी **Offline indicator + सबै Firestore save form मा error handling** लगाउनु नै ठूलो फाइदा दिन्छ।
