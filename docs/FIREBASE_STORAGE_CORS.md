# Firebase Storage CORS Enable गर्ने तरिका

**Simple meaning:** Browser लाई Firebase Storage बाट file (जस्तै PDF) लिन **permission** दिइएको छैन। CORS set गरेपछि Firebase भन्छ "ठीक छ, लिन पाउँछौ" र preview देखिन्छ।

---

## Step 1 — `cors.json` use गर

Project को root मा **`cors.json`** पहिले नै छ। यसमा:

- `http://localhost:3000` / `http://127.0.0.1:3000` — Next dev / Electron default static port (`PL_ELECTRON_STATIC_PORT`, default `3000`)
- `http://localhost:55818` जस्ता अरू localhost port — पुरानो Electron `listen(0)` random port; **हरेक नयाँ port = नयाँ origin** — `http://localhost:54823` जस्ता port CORS मा नभए सम्म browser फेरि block गर्छ
- Firebase Hosting URLs — यदि तपाईंले deploy गर्नुभयो भने

**Production domain** थप्न: `cors.json` खोल्नुहोस् र आफ्नो domain `origin` मा राख्नुहोस्:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

---

## Step 2 — Firebase bucket name निकाल

1. **Firebase Console** खोल्नुहोस्: https://console.firebase.google.com  
2. Project select गर्नुहोस्  
3. **Storage** → बाट माथि **bucket name** लिनुहोस्  

जस्तो: `studio-5452513410-a3f5b.firebasestorage.app`  
Full bucket: **`gs://studio-5452513410-a3f5b.firebasestorage.app`**

---

## Step 3 — Google Cloud SDK (gsutil) install

यदि पहिले नै छैन भने:

1. **Google Cloud SDK** install गर्नुहोस्:  
   👉 https://cloud.google.com/sdk/docs/install  
2. Terminal मा login:

   ```bash
   gcloud auth login
   ```

3. Default project set (optional):

   ```bash
   gcloud config set project studio-5452513410-a3f5b
   ```

---

## Step 4 — CORS apply गर

**एक पटकमा एउटा कमान्ड मात्र चलाउनुहोस्** — दुई कमान्ड एकै लाइनमा जोड्दा `file:// URL` error आउछ।

**Windows CMD मा:** `cd d:\pocket-ledger` ले drive बदल्दैन, त्यसैले **सधैं full path** दिनुहोस्:

```bash
gsutil cors set d:\pocket-ledger\cors.json gs://studio-5452513410-a3f5b.firebasestorage.app
```

**Project script (PATH me `gsutil` ho tab):** repo root बाट:

```bash
npm run storage:cors
```

(कुनै पनि directory बाट चल्छ।)

**अर्को bucket** भए: माथिको `gs://...` ठाउँमा आफ्नो bucket लेख्नुहोस्।

---

## Step 5 — Verify

CORS set भयो कि भएन **अर्को लाइनमा** यो कमान्ड run गर्नुहोस् (bucket पछि `/` लगाउनु पर्दैन):

```bash
gsutil cors get gs://studio-5452513410-a3f5b.firebasestorage.app
```

JSON (तपाईंले राख्नुभएको `cors.json` जस्तै) देखियो भने **success**।

---

## Production Deploy गर्दा

Deploy गरेपछि आफ्नो **live domain** पनि `cors.json` को `origin` मा थप्नुहोस्। Example:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "https://yourdomain.com",
      "https://www.yourdomain.com"
    ],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

पछि फेरी Step 4 जस्तै run गर्नुहोस्:

```bash
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```

---

## Simple Language मा

| बुझाइ |
|--------|
| तिम्रो site भन्छ: "Firebase, PDF देऊ" |
| Firebase भन्छ: "तिमीलाई permission छैन" |
| **CORS set गरेपछि** Firebase भन्छ: "ठीक छ, लिन पाउँछौ" |

**Note:** यो app मा Unassigned Documents को PDF preview **Firebase Storage SDK** (`getBlob`) बाट लिइएको छ (जब `storagePath` दिइन्छ), त्यसले CORS मा निर्भर गर्दैन। तर अन्य जहाँ पनि **direct download URL** (fetch) use गर्नुहुन्छ भने CORS enable गर्नु जरुरी छ।
