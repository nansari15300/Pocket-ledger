# src फोल्डर र Build गरिएको App मा Code – को हेर्न सक्छ?

Build गर्दा **src** को code को हेर्न सक्छ कि सक्दैन, र **protection** कति सम्भव छ त्यो यो doc मा छ।

---

## १) साधारण जवाफ

| Build प्रकार | src को code को हेर्न सक्छ? | कस्तो हेर्न सक्छ? |
|--------------|----------------------------|-------------------|
| **Web** (browser) | **हो, सक्छ** | Browser मा DevTools → Sources/Network बाट JS/CSS देखिन्छ। Minified/bundled भए पनि read गर्न सकिन्छ। |
| **EXE (Electron)** | **हो, सक्छ** | App को folder (e.g. `resources/app`) मा JS बण्डल हुन सक्छ; उठाएर पढ्न सकिन्छ। |
| **APK (Android)** | **हो, सक्छ** | APK एक zip जस्तै; भित्र assets/JS/HTML निकालेर देख्न सकिन्छ। Decompile पनि गर्न सकिन्छ। |
| **iOS** | **हो, सक्छ** | IPA भित्रको web content वा JS देख्न/निकाल्न सकिन्छ। |

**निष्कर्ष:** Build गरिएको app मा **client-side** (browser/WebView मा चल्ने) code **पूर्ण रूपमा कसैले नहेर्ने** गराउन **सम्भव छैन**। Minify/obfuscate गर्दा पढ्न गाह्रो हुन्छ, तर logic निकाल्न सकिन्छ। त्यसैले **src folder protection** = "कोहीले कहिल्यै नदेखोस्" भन्ने **guarantee** दिँदैन।

---

## २) प्रत्येक Build मा के देखिन्छ

### Web (Next.js deploy)

- **Build output:** `.next/` मा JS/CSS bundles (chunks)। Deploy गर्दा यही static files server बाट serve हुन्छन्।
- **User के गर्छ:** Browser मा साइट खोल्छ, DevTools (F12) → **Sources** वा **Network** मा जान्छ। त्यहाँ **.js** files खुल्छन्। Minified भए पनि (variable names साना, एक लाइनमा धेरै code) पढ्न र समझ्न सकिन्छ।
- **Server-side:** `getServerSideProps`, API routes (`src/app/api/`), server-only code **browser मा पठाइँदैन**। त्यसैले यी **client मा देखिँदैन**। तर server को logs वा hosting मा access भएमा देखिन सक्छ।

### EXE (Electron)

- App को install location मा (e.g. `C:\Users\...\AppData\...`) **resources** वा **app.asar** जस्तो folder/file हुन्छ। **asar** भएमा `asar extract` गरेर भित्रको JS निकाल्न सकिन्छ।
- भित्र **HTML/JS** (वा deployed URL load भएको भए पनि cache) देखिन सक्छ। त्यसैले **src** को logic जो client मा चल्छ त्यो **निकालेर हेर्न सकिन्छ**।

### APK (Capacitor / WebView)

- APK = ZIP। Unzip गरेर **assets** वा **www** जस्ता folder मा **HTML, JS, CSS** पाइन्छ। यही तपाईंको web app को bundled code हो।
- कोहीले यो निकालेर **src** जस्तो structure नभए पनि **logic र behaviour** पढ्न सक्छ।

### iOS

- IPA पनि archive हो। भित्रको WebView content वा embedded JS देख्न/export गर्न सकिन्छ।

---

## ३) के गर्दा के हुन्छ (Protection / Best practices)

| कुरा | के हुन्छ | सुरक्षा |
|------|----------|---------|
| **Minify / Bundle** | Next.js build ले आफैं JS minify गर्छ। Code एक वा धेरै chunk मा बन्द हुन्छ। | **देखिन्छ** तर पढ्न **गाह्रो**। पूर्ण hide हुँदैन। |
| **Obfuscate** | Tool (e.g. javascript-obfuscator) ले variable/function names र structure जटिल बनाउँछ। | पढ्न **धेरै गाह्रो**। तर determined person ले logic निकाल्न सक्छ। |
| **Secrets (API key, password)** | यदि **client-side** code मा राख्नुभयो भने कोहीले bundle खोलेर देख्न सक्छ। | **नराख्नुहोस्।** Server/API मा राख्नुहोस्, client लाई token वा proxy बाट दिनुहोस्। |
| **Server-side / API** | `src/app/api/`, server components, DB credentials – यी **browser/EXE/APK मा पठाइँदैन**। | **Client मा देखिँदैन**। Server र env मा मात्र हुन्छ। |
| **Environment variables** | `NEXT_PUBLIC_*` बाट सुरु भएको **client** मा expose हुन्छ। बाँकी server मा। | **गोप्य चीज** `NEXT_PUBLIC_` मा नराख्नुहोस्। |

**छोट्करी:**

- **src folder** को जो भाग **client** मा चल्छ (browser वा WebView), त्यो **कसैले हेर्न सक्छ** (minified/obfuscated भए पनि)।  
- **पूर्ण protection** = client मा नचल्ने logic server मा राख्नु; client मा **गोप्य चीज (keys, secrets)** नराख्नु।  
- **Obfuscation** ले curiosity वा साधारण copy लाई झन् गाह्रो बनाउँछ, तर "कसैले देख्न सक्दैन" भन्ने **guarantee** छैन।

---

## ३.१) "Code पूरै नखुलेको गराउने कुनै security छैन र?"

**सीधा जवाफ:** **Client मा चल्ने code** लाई **पूरै नखुलेको** (१००% hide) गराउने **कुनै security / तरिका छैन**। जो code browser वा app (EXE/APK) मा चल्छ, त्यो device मा पुग्छ नै पुग्छ; त्यसैले कोहीले निकालेर हेर्न सक्छ।

**किन?**

- App/website ले **चलाउन** नै पर्छ। चलाउन = device ले code **execute** गर्छ। Execute गर्न = code **उहीँ** (वा decode गरेपछि) हुनुपर्छ। त्यसैले "चल्छ तर कसैले देख्न सक्दैनन" गराउने **technically असम्भव** छ।
- Encrypt गरेर पठाए पनि: decrypt गर्ने key वा logic **client मा नै** हुनुपर्छ, नभए चल्दैन। त्यसैले determined person ले त्यो निकालेर code पाउँछ।

**के–के गर्दा के हुन्छ:**

| के गर्ने | के हुन्छ | पूरै नखुल्ने? |
|----------|----------|----------------|
| **Minify** | Code सानो र पढ्न गाह्रो बन्छ। | **होइन** – फेरि पनि देखिन्छ। |
| **Obfuscate** | Variable/function नाम र structure जटिल; reverse गर्न झन् मेहनत। | **होइन** – logic निकाल्न सकिन्छ। |
| **Server-side मा राख्ने** | जो logic **server** मा चल्छ (API, DB) त्यो client मा पठाइँदैन। | **हो** – build गरिएको app बाट **त्यो part** देखिँदैन। |

**निष्कर्ष:** Client-side को लागि **"पूरै नखुलेको"** गराउने कुनै सुरक्षा **छैन**। जति गर्न सकिन्छ: **(१)** minify + obfuscate ले **पढ्न/निकाल्न गाह्रो** बनाउनु, **(२)** महत्त्वपूर्ण logic र secrets **server** मा राख्नु (त्यो नै साँचो "नखुलेको" हुन्छ), **(३)** यो सीमा accept गर्नु।

---

## ४) सारांश

| प्रश्न | जवाफ |
|--------|--------|
| Build गरिएको app मा src को code को हेर्न सक्छ? | **हो।** Web, EXE, APK, iOS सबैमा client-side code **देखिन/निकाल्न सकिन्छ**। |
| पूर्ण रूपमा बचाउन सकिन्छ? | **सकिँदैन।** Client मा चल्ने code लाई १००% hide गर्ने तरिका छैन। |
| के गर्ने? | (१) **Secrets** client मा नराख्नु; server/API र env मा राख्नु। (२) Build ले **minify** गर्छ नै। (३) चाहिए **obfuscation** tool प्रयोग गर्न सकिन्छ। (४) संवेदनशील logic **server-side** राख्नु। |

यो doc लाई **src folder protection** को reference को रूपमा राख्न सकिन्छ: build पछि पनि client-side code **देखिन सक्छ**, त्यसैले **protection** = secrets नराख्नु + जति पनि संवेदनशील logic server मा राख्नु।

---

## ५) "कोड देखिन्छ भने कोही चोरेर आफ्नै app बनाउन सक्छ होला नि?"

**सीधा जवाफ:** Code **निकालेर हेर्न** सक्छ, तर त्यसैले **सजिलैसँग आफ्नै चल्ने app** बनाउन सक्छ भन्ने **हुँदैन**। यसले developer लाई पूरै असुरक्षित पनि पार्दैन।

### किन "चोरी गरेर app" सजिलो छैन

| कुरा | के हुन्छ |
|------|----------|
| **Firebase / Backend** | App तपाईंको **Firebase project** (Project ID, Firestore, Auth, Rules) मा जोडिएको हुन्छ। Copy गर्नेले **आफ्नै project** बनाएर keys/config लगाउनुपर्छ। तपाईंको **data, users, companies** उसको पास हुँदैन। |
| **API keys / Secrets** | यदि तपाईंले **client मा** API key वा secret **नराख्नुभयो** (server वा env मा मात्र राख्नुभयो), त copy गर्नेले तपाईंको key **पाउँदैन**। उसले आफ्नै backend लगाउनुपर्छ। |
| **Data र Users** | सबै data तपाईंको Firestore/DB मा। Code copy भए पनि **तपाईंको data** उसको app मा आउँदैन। Userहरू पनि तपाईंको Auth मा। |
| **Update र Feature** | तपाईंले नयाँ feature, fix, security लगाउनुहुन्छ। Copy एक पटकको snapshot; पछि **outdated** रहन्छ। |
| **कानूनी (Copyright)** | Code तपाईंको intellectual property। बिना अनुमति copy गरेर बेच्ने/चलाउने **copyright violation** हुन सक्छ। |
| **Branding, Design** | Logo, नाम, design पनि copy गर्न मिल्ने तर **trademark / branding** अर्को मुद्दा; उसको app तपाईंको brand होइन। |

### के गर्ने (developer को तर्फ)

- **Secrets client मा नराख्नु** – Firebase config मा Project ID देखिन्छ (सामान्य), तर **API key restrict** गर्नु (Firebase Console मा), र **admin/secret keys** कहिल्यै client मा नराख्नु।  
- **महत्त्वपूर्ण logic server मा** – payment, plan check, super admin list जस्ता चीज server/API मा गर्नु।  
- **Legal** – License (e.g. proprietary), terms of use राख्न सकिन्छ; copy बेच्ने/redistribute गर्ने रोक्न सकिन्छ।  
- **Obfuscate** – चाहिएमा JS obfuscate गर्न सकिन्छ; copy गर्न **गाह्रो** बनाउँछ, तर १००% रोक्न सकिँदैन।

**छोट्करी:** कोड **देखिन सक्छ** भनेर मात्र कोही "चोरेर तत्काल आफ्नै पूरा app" चलाउन सक्छ भन्ने **हुँदैन**। Backend, data, keys, updates र कानूनी कुरा मिलेर **तपाईंको app** नै चलिरहन्छ; copy गर्नेलाई फेरि आफ्नै backend, data र legal risk लिनुपर्छ।

### "Data नचोरी पनि, code चोरेर छिट्टै आफ्नै config लगाएर अलग app बनाउन सक्छ होला नि?"

**हो, सक्छ।** तपाईंको **data** उसको पास हुँदैन, तर **code** लिएर आफ्नै Firebase project, आफ्नै env, आफ्नै domain लगाएर **अलग app** (clone/fork) चलाउन सक्छ। त्यो उसको server, उसको DB, उसको users हुन्छ – तपाईंको data चोरी हुँदैन, तर **product को structure र logic** copy भएको हुन्छ।

**के अर्थ लाग्छ:**

| कुरा | सत्य |
|------|------|
| तपाईंको data/users | **सुरक्षित** – उसको app मा आउँदैन। |
| तपाईंको code (client) | **निकाल्न सकिन्छ** – उसले आफ्नै config मा चलाउन सक्छ। |
| परिणाम | उसले **आफ्नै config** बाट "तपाईंजस्तो" app चलाउन सक्छ; data चोरी भएन, तर **code reuse** भयो। |

**Developer ले के गर्न सक्छ:** (१) **कानूनी** – code तपाईंको copyright; बिना अनुमति reuse/बेच्ने रोक्न license र terms मा लेख्न सकिन्छ। (२) **Obfuscate** – copy गर्न र आफ्नै config मा चलाउन **गाह्रो** बनाउन सकिन्छ। (३) **महत्त्वपूर्ण logic server मा** – billing, plans, admin जस्ता server मा राख्दा clone मा त्यो भाग **तपाईंबिना** पूरा चल्दैन। (४) **Accept** – client-side app को लागि "code कोहीले आफ्नै config मा चलाउन सक्छ" भन्ने **सम्भव** नै छ; पूर्ण रोक्न सकिँदैन, तर legal र technicalले नियन्त्रण गर्न सकिन्छ।
