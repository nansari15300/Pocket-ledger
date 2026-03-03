# Web App बनाउने / Deploy गर्ने विधि (Pocket Ledger)

Pocket Ledger लाई **web** मा चलाउन र **deploy** गर्ने तरिका।

---

## १) Local मा चलाउनु (Development)

```bash
npm install
npm run dev
```

Browser मा `http://localhost:3000` खोल्नुहोस्।

---

## २) Production build (local test)

```bash
npm run build
npm run start
```

यसले production build चलाउँछ (`http://localhost:3000`)।

---

## ३) Deploy गर्नु

### Vercel (सिफारिश – Next.js को लागि)

1. Code लाई **GitHub** मा push गर्नुहोस्।
2. [vercel.com](https://vercel.com) मा जानुहोस्, "Import Project" गर्नुहोस्।
3. Repo रोज्नुहोस्, environment variables (Firebase इत्यादि) थप्नुहोस्।
4. Deploy गर्नुहोस्। URL मिल्छ (e.g. `https://pocket-ledger.vercel.app`)。

**CLI बाट:**

```bash
npm i -g vercel
vercel
```

### Firebase Hosting

1. **Firebase** project सेटअप गर्नुहोस्।
2. Build गर्नुहोस्: `npm run build`।
3. Firebase Hosting मा deploy (Next.js को लागि Firebase SSR support वा static export प्रयोग गर्नुहोस्)।

```bash
firebase init hosting
# build output directory: .next वा out (config अनुसार)
firebase deploy
```

### अन्य (Netlify, Railway, आदि)

- **Netlify:** GitHub connect गरेर build command `npm run build`, publish directory `.next` वा `out`।
- **Railway / Render:** Node.js project को रूपमा add गरेर `npm run build` र `npm run start` सेट गर्नुहोस्।

---

## ४) PWA (Install जस्तो experience)

- **manifest.json** र **service worker** थप्नुहोस् (e.g. `next-pwa` वा manual)।
- User ले browser बाट "Install Pocket Ledger" / "Add to Home Screen" गर्दा app जस्तै खुल्छ।
- यसले साँचो .exe/.apk दिँदैन, तर web मा install जस्तो experience दिन्छ।

---

## ५) सारांश

| काम              | आदेश / तरिका |
|------------------|----------------|
| Local dev        | `npm run dev` |
| Production build | `npm run build` र `npm run start` |
| Deploy (Vercel)  | GitHub → Vercel Import वा `vercel` |
| Deploy (Firebase)| `firebase init hosting` र `firebase deploy` |
| PWA              | manifest + service worker |

---

**सम्बन्धित:** [PLAN-TO-BUILD-EXE-APK.md](./PLAN-TO-BUILD-EXE-APK.md) | [BUILD-EXE.md](./BUILD-EXE.md) | [BUILD-APK.md](./BUILD-APK.md)
