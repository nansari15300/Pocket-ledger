# PERMISSION_DENIED – किन आउँछ र के गर्ने

जब सबै ठीक लाग्दा पनि Firestore बाट **PERMISSION_DENIED** आउँछ भने यी चेक गर्नुहोस्।

---

## १. Firestore Rules Deploy गर्नुभयो?

कोडमा `src/firestore.rules` सही छ तर **Firebase मा deploy नगरे** सम्म त्यो लागू हुँदैन।

```bash
firebase deploy --only firestore:rules
```

- Firebase CLI लग इन गर्नुहोस् (`firebase login`)
- Project select गर्नुहोस् (`firebase use <project-id>`)
- माथिको कमान्ड चलाउनुहोस्

---

## २. Network / "Fetch failed"

Console मा **"Fetch failed loading: GET/POST ... firestore.googleapis.com/Listen/channel"** आउँछ भने:

- **Firewall / Proxy** ले `firestore.googleapis.com` ब्लक गरिरहेको हुन सक्छ।
- **VPN** हटाएर वा अर्को नेटवर्क (mobile data / अर्को WiFi) बाट try गर्नुहोस्।
- **Incognito** वा अर्को browser मा खोलेर पनि try गर्नुहोस्।

Connection fail भएपछि retry मा server ले PERMISSION_DENIED पठाउन सक्छ।

---

## ३. Auth / Token

- **त्यही इमेल** ले लग इन गर्नुभयो कि जसको नाममा company को **ownerEmail** छ?
- Firebase Console → Authentication → Users मा उक्त user को **UID** र **Email** company doc को **ownerId** / **ownerEmail** सँग **एकदमै मिल्छ** कि जाँच गर्नुहोस्।

---

## ४. App मा गरिएको सुधार

- **Owner** भए PERMISSION_DENIED आए पनि **companyId clear गरिँदैन** (Settings लूप रोक्न)।
- Listener लगाउनु अघि **१५० ms ढिला** गरिएको छ ताकि auth token Listen request मा लाग्न सक्छ।

---

## ५. अझै deny आउँछ भने

1. Firebase Console → Firestore → **Rules** ट्याब खोल्नुहोस् – त्यहाँ जो rules देखिन्छ त्यो नै **deployed** rules हो। कोडको `src/firestore.rules` सँग मिल्छ कि हेर्नुहोस्।
2. Company doc मा **ownerId** र **ownerEmail** फेरि हेर्नुहोस् (typo / अर्को user को ID त छैन नि)।
3. एक पटक **लग आउट** गरेर फेरि **लग इन** गर्नुहोस् र पेज refresh गर्नुहोस्।
