# Offline ७ दिन मात्र र Online मा Reset (Build नियम)

**नियम:** कुनै पनि build (Web, EXE, APK, iOS, Linux) मा app लाई **offline** मा **७ दिन मात्र** चलाउन दिइन्छ। जुन दिन user **online** हुन्छ, त्यही दिनबाट **७ दिन फेरि** गणना रिसेट हुन्छ।

---

## १) नियम संक्षेप

| कुरा | के हुन्छ |
|------|----------|
| **Offline** | App ७ दिन सम्म चल्छ। ७ दिन पुगेपछि "Offline period ended" overlay आउँछ र आगाडि बढ्न मिल्दैन। |
| **Online** | जब device internet सँग जोडिन्छ, त्यही बेला **last online** date update हुन्छ। अर्को पटक offline जाने बित्तिकै **नयाँ ७ दिन** सुरु हुन्छ। |
| **Reset** | हरेक पटक online आउँदा दिन रिसेट; कुनै निश्चित "monthly" वा "weekly" cycle होइन। |

---

## २) कहाँ Implement छ

| फाइल | काम |
|------|-----|
| **`src/lib/offlineGraceClient.ts`** | `lastOnlineAt` localStorage मा राख्छ; ७ दिन expiry, बाँकी दिन निकाल्छ। |
| **`src/contexts/OfflineGraceContext.tsx`** | `navigator.onLine` र `online`/`offline` event सुन्छ; online भएमा `setLastOnlineAt()` ले रिसेट; expired भएमा overlay दिँछ। |
| **`src/app/providers.tsx`** | `OfflineGraceProvider` ले सारा app लाई ओगटेको छ, त्यसैले सबै build मा यही नियम लागू। |

---

## ३) बिधि (कसरी काम गर्छ)

1. **पहिलो पटक चलाउँदा (वा कुनै पनि online दिन):**  
   जब `navigator.onLine === true` हुन्छ, app ले `localStorage` मा `pocket_ledger_last_online_at` = अहिलेको time (ms) राख्छ।

2. **Offline जाने बित्तिकै:**  
   ७ दिन = `lastOnlineAt + (7 × 24 × 60 × 60 × 1000)`। यो समय नाघेसम्म app सामान्य चल्छ।

3. **७ दिन पुगेपछि (अझै offline):**  
   `isOfflineGraceExpired()` true हुन्छ। `OfflineGraceProvider` ले **"Offline period ended"** overlay दिँछ। User ले internet जोडेर फेरि online आउनुपर्छ।

4. **फेरि online आउँदा:**  
   Browser/device को `online` event फायर हुन्छ। App ले `setLastOnlineAt()` गर्छ (अहिलेको time)। त्यसैले **दिन रिसेट** भई अर्को offline period को लागि नयाँ ७ दिन सुरु हुन्छ।

---

## ४) सारांश

- **कुनै पनि build** मा offline **७ दिन मात्र**; त्यसपछि connect गर्नुपर्छ।
- **जुन दिन online हुन्छ** त्यही दिनबाट ७ दिन रिसेट; बिधि यहीँ मा रहेको code मा नै छ।
- यो नियम **नहटाउने**; सबै platform (Web, EXE, APK, iOS, Linux) मा समान लागू हुनुपर्छ।

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [ADMIN-PLANS-AND-OFFLINE-UPDATE.md](./ADMIN-PLANS-AND-OFFLINE-UPDATE.md)
