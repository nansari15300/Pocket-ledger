# Firebase Rules – Summary (App ma vayeko ra baaki)

## IMPORTANT: "Missing or insufficient permissions" fix (dashboard / vouchers / company)

**FirebaseError: Missing or insufficient permissions** dashboard ya company/vouchers ma aaucha vane:

1. **Firestore rules deploy gareko chaina.**  
   Yei le garda signup pachi user doc read/create, company list, company create sync, vouchers list sab permission-denied aaucha.

   **Command (project root `d:\pocket-ledger` bata):**

   ```bash
   firebase deploy --only firestore:rules
   ```

   Pahile `firebase login` ra `firebase use <project-id>` gareko chaina bhane tyo pani garne.

2. **Company doc ma owner fields.**  
   Firestore → `companies` → tyo company doc ma **ownerId** = login user ko uid, **ownerEmail** = login user ko email huna parcha. Nabhaye vouchers/company access deny huncha.

Deploy sakepachi page refresh garera feri sign-in garne. Permission errors hatna parcha.

---

## Ahile samma gariyeko (Existing)

### Firestore (`src/firestore.rules`)

| Collection / Path | Rule |
|-------------------|------|
| `users/{userId}` | get/list/create/update/delete – owner only; list allowed for chat |
| `users/{userId}/transactions/{id}` | Owner only (path-based) |
| `users/{userId}/categories/{id}` | Owner only (path-based) |
| `conversations/{id}` | Participants only (conversationId contains both user ids) |
| `conversations/{id}/messages/{msgId}` | Participants: read/list; create by sender; update (read status) by receiver; delete by sender |
| `companies/{companyId}` | Read: owner or shared user; create: signed-in, ownerEmail = auth.email; update/delete: owner only |
| `companies/{companyId}/vouchers/{id}` | Company user: read, list, create, update, delete |
| `companies/{companyId}/parties/{id}` | Company user: full access |
| `companies/{companyId}/groups/{id}` | Company user: full access (party groups) |
| `companies/{companyId}/staff/{id}` | Company user: full access |
| `companies/{companyId}/staff_groups/{id}` | Company user: full access |
| `companies/{companyId}/taxes/{id}` | Company user: full access |
| `companies/{companyId}/tax_groups/{id}` | Company user: full access |
| `companies/{companyId}/expense_accounts/{id}` | Company user: full access |
| `companies/{companyId}/expense_groups/{id}` | Company user: full access |
| `companies/{companyId}/bank_accounts/{id}` | Company user: full access |
| `companies/{companyId}/account_groups/{id}` | Company user: full access |
| `companies/{companyId}/items/{id}` | Company user: full access |
| `companies/{companyId}/item_groups/{id}` | Company user: full access |
| `companies/{companyId}/unassigned_documents/{id}` | Company user: full access |
| `companies/{companyId}/presence/{userId}` | Company user read; write only own userId |
| `companies/{companyId}/alarms/{id}` | Company user: read, create, update, delete |
| `companies/{companyId}/payments/{id}` | Company user: full access |
| `admin_notifications/{id}` | create: signed-in; read/update/delete: recipientUserId = auth.uid |
| `activity_logs/{id}` | create, read, list: signed-in; update/delete: false |
| `payments/{id}` (root) | signed-in: full access |
| `config/{docId}` | signed-in: read, write (e.g. recycleBin config) |

### Storage (`src/storage.rules`) – **Naya add gareko**

| Path | Rule |
|------|------|
| `voucher-files/{companyId}/**` | Signed-in: read, write |
| `companies/{companyIdOrKey}/**` | Signed-in: read, write (vouchers, unassigned, avatar, stamp, other) |

---

## Baaki ma add / update gareko (Changes in this pass)

1. **Firestore – `isCompanyUser` / `isCompanyOwner`**  
   - Company access aba `ownerId == request.auth.uid` pani check garxa (pahile `ownerEmail` matra thiyo).  
   - App ma `ownerId` use bhayeko le rules ma pani ownerId support gareko.

2. **Firestore – `distributor_applications/{id}`**  
   - **create:** koi pani signed-in user le create garna sakcha.  
   - **read:** application owner (resource.data.userId / email = auth) le matra doc read garna sakcha.  
   - **list:** signed-in user le list garna sakcha (admin panel ko lagi).  
   - **update, delete:** disabled (false).

3. **Storage rules**  
   - Pahile project ma `storage.rules` thiena. `src/storage.rules` add gareko ra `firebase.json` ma `storage.rules` path set gareko.

4. **firebase.json**  
   - `storage.rules` point to `src/storage.rules` gareko.

---

## Firebase ma apply garera test garna

1. **Firestore rules**  
   - Firebase Console → Firestore Database → Rules.  
   - `src/firestore.rules` ko content copy-paste garera Publish garne, **or**  
   - Terminal: `firebase deploy --only firestore:rules`

2. **Storage rules**  
   - Firebase Console → Storage → Rules.  
   - `src/storage.rules` ko content copy-paste garera Publish garne, **or**  
   - Terminal: `firebase deploy --only storage`

3. **Dono ekai choti**  
   - `firebase deploy --only firestore:rules,storage`

Deploy pachi app bata create/read/update/delete sab test garera kaam garxa ki nagarxa hernu.

---

## Permission-denied fix (companies / vouchers)

Agar **Missing or insufficient permissions** aaucha (e.g. `companies/{companyId}/vouchers` list ma):

1. **Rules deploy gareko cha ki nai**  
   - Firebase Console → Firestore → Rules ma `src/firestore.rules` ko content paste garera Publish garne, **or**  
   - `firebase deploy --only firestore:rules` run garne.

2. **Company document ma owner fields**  
   - Firestore → `companies` → tyo company doc (e.g. `50793618-5a44-4b10-a7a3-0d771ac4516f`) kholera hernu.  
   - **ownerId** = login user ko uid (e.g. `ZyQez5LJUhalKtxLazrdrg1fsOH3`)  
   - **ownerEmail** = login user ko email (e.g. `manishshah46@gmail.com`)  
   - Purano company ma yei fields nabhako bhaye add/update garne; pachi vouchers subcollection access chalcha.

---

## File location (existing folder)

- Firestore rules: `src/firestore.rules`  
- Storage rules: `src/storage.rules`  
- Indexes: `src/firestore.indexes.json`  
- Summary (yo doc): `src/FIREBASE_RULES_SUMMARY.md`

Firebase Console ma manually paste garna ho bhane: `src/firestore.rules` ra `src/storage.rules` open garera copy-paste garne; deploy use garna ho bhane `firebase deploy` run garne.
