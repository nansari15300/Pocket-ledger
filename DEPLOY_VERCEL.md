# Vercel मा Deploy गर्ने तरिका (vercel.com)

## १. तयारी

- Code **GitHub / GitLab / Bitbucket** मा push गर्नुहोस् (Vercel सीधा repo बाट deploy गर्छ)।
- Local मा test: `npm run build` चलाएर build सफल भएको निश्चित गर्नुहोस्।

## २. Vercel मा Project बनाउने (Dashboard बाट)

1. **https://vercel.com** मा जानुहोस् र लग इन गर्नुहोस् (GitHub/GitLab साथ)।
2. **"Add New..." → "Project"** क्लिक गर्नुहोस्।
3. **"Import Git Repository"** मा आफ्नो repo (pocket-ledger) select गर्नुहोस्।
4. Vercel ले Next.js auto-detect गर्छ। यदि **Root Directory** अरू folder भए **Override** गर्नुहोस् (साधारणतया खाली राख्नुहोस्)।
5. **Environment Variables** थप्नुहोस् (Firebase, Stripe, etc. जो local `.env.local` मा छ):
   - **Project Settings → Environment Variables** मा जानुहोस्।
   - `.env.local` बाट जस्तै key/value add गर्नुहोस् (e.g. `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_*`, etc.)।
   - Production र Preview दुवैमा चाहिएमा same variables set गर्नुहोस्।
6. **Deploy** क्लिक गर्नुहोस्।

Build सकिएपछि तपाईंको site **`project-name.vercel.app`** मा खुलेको हुन्छ।

---

## ३. CLI बाट Deploy (वैकल्पिक)

```bash
# Vercel CLI install
npm i -g vercel

# Login (browser खुल्छ)
vercel login

# Project folder मा
cd d:\pocket-ledger

# पहिलो पटक: link + deploy (project create हुन्छ)
vercel

# Production deploy
vercel --prod
```

CLI बाट पहिलो पटक चलाउँदा Vercel सोध्छ: Link to existing project? **No** → New project name दिनुहोस्।  
**Environment Variables** CLI मा prompt आउन सक्छ; नआएमा Dashboard बाट **Project → Settings → Environment Variables** मा थप्नुहोस्।

---

## ४. Environment Variables (अति जरूरी)

Local को `.env.local` मा जे जे छ (Firebase config, API keys, etc.) ती सबै **Vercel → Project → Settings → Environment Variables** मा add गर्नुहोस्।  
Example:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- … (बाँकी Firebase / Stripe / अन्य keys)

**कुनै पनि secret key (.env.local मा) Vercel मा बिना set गर्दा production मा app ठीकसँग काम गर्दैन।**

---

## ५. Build मा Memory (पहिले नै सेट गरिएको)

`vercel.json` मा `buildCommand` राखिएको छ जसले build समयमा ज्यादा memory प्रयोग गर्छ (`--max-old-space-size=4096`)। यदि Vercel ले default build use गर्छ भने Dashboard मा **Build & Development Settings → Build Command** मा यो राख्न सक्नुहुन्छ:

```bash
node --max-old-space-size=4096 ./node_modules/next/dist/bin/next build
```

---

## ६. Custom Domain (वैकल्पिक)

**Project → Settings → Domains** मा custom domain (e.g. `app.tapainodomain.com`) add गर्न सक्नुहुन्छ। Vercel ले DNS instructions दिन्छ।

---

## सारांश

| चरण | काम |
|-----|-----|
| 1 | Code GitHub/GitLab मा push |
| 2 | vercel.com → New Project → Repo import |
| 3 | Environment Variables (Firebase, etc.) add |
| 4 | Deploy क्लिक |
| 5 | `project-name.vercel.app` मा site खुल्छ |

कुनै step मा अट्किएमा Vercel को **Deployments** tab मा **Build Logs** खोलेर error हेर्नुहोस्।
