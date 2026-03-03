# Offline मात्र ७ दिन – जुन दिन Online हुन्छ त्यस दिन Reset

कुनै पनि build (Web, EXE, APK, iOS, Linux) मा app लाई **offline मात्र ७ दिन** को लागि मात्र use गर्न दिइन्छ। **जुन दिन user online हुन्छ, त्यस दिनबाट ७ दिन फेरि गणना रिसेट हुन्छ**।

---

## १) नियम (बिधि)

| कुरा | के हुन्छ |
|------|----------|
| **Offline use** | App offline चलाउन सकिन्छ **७ दिन** सम्म। |
| **७ दिन पछि** | यदि अझै offline छ भने app ले **"Offline period ended"** ओभरले देखाउँछ र आगाडि बढ्न दिँदैन। User लाई internet जोड्न अनुरोध गर्छ। |
| **जुन दिन online हुन्छ** | त्यस दिन **last online time** अपडेट हुन्छ। त्यसबाट **अर्को ७ दिन** फेरि offline use पाउँछ। |
| **Reset** | Online आएपछि (browser/device को `online` event) **अटोमेटिक** रिसेट। कुनै बटन थिच्नु पर्दैन। |

---

## २) Technical कसरी काम गर्छ

- **Storage:** `localStorage` मा `pocket_ledger_last_online_at` (timestamp in ms) राखिन्छ।
- **जब online:** (navigator.onLine = true) → `last_online_at = अहिले को समय` सेट हुन्छ। यसले ७ दिन को खिड्की **त्यही दिनबाट फेरि सुरु** गर्छ।
- **जब offline:** हरेक पटक जाँच: `अहिले > last_online_at + ७ दिन` भए **expired** मानिन्छ र ओभरले दिइन्छ।
- **पहिलो चलन:** यदि कुनै पहिले को मान छैन भने पहिलो online/offline मा `last_online_at` सेट गरिन्छ; offline भए पनि त्यही बाट ७ दिन गणना हुन्छ।

**Code ठाउँहरू:**
- `src/lib/offlineGraceClient.ts` – last online get/set, expired check, दिन बाँकी।
- `src/contexts/OfflineGraceContext.tsx` – Provider, online/offline listener, expired ओभरले।

---

## ३) सारांश

| प्रश्न | जवाफ |
|--------|--------|
| Offline कति दिन? | **७ दिन** मात्र। |
| Online आएपछि? | **त्यही दिन** ७ दिन फेरि रिसेट हुन्छ (अर्को ७ दिन offline पाउँछ)। |
| Reset कसरी? | **अटोमेटिक** – जुन दिन device/browser online हुन्छ त्यसैले `last_online_at` अपडेट हुन्छ। |
| कुन build मा? | **सबै** build मा (Web, EXE, APK, iOS, Linux) – सबैमा यही logic लागू। |

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md)
