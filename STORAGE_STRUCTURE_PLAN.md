# Firestore & Firebase Storage Tree Structure Plan

## 📋 Current Structure Analysis

### Current Firestore Structure:
```
companies/
  └── {companyId}/
      ├── vouchers/          ✅ Already organized
      ├── parties/           ✅ Already organized
      ├── groups/            ✅ Already organized
      ├── staff/             ✅ Already organized
      ├── staff_groups/      ✅ Already organized
      ├── bank_accounts/    ✅ Already organized
      ├── account_groups/    ✅ Already organized
      ├── items/             ✅ Already organized
      ├── item_groups/       ✅ Already organized
      ├── taxes/             ✅ Already organized
      ├── tax_groups/        ✅ Already organized
      ├── expense_accounts/  ✅ Already organized
      ├── expense_groups/    ✅ Already organized
      └── unassigned_documents/ ✅ Already organized
```

### Current Storage Structure:
```
companies/
  └── {companyId}__{companyName}/
      ├── vouchers/
      │   └── {voucherType}/
      │       └── {year}/
      │           └── {month}/
      │               └── {day}/
      │                   └── {voucherId}/
      │                       └── {files}
      ├── unassigned/
      │   └── {year}/
      │       └── {month}/
      │           └── {files}
      ├── avatar/
      │   └── {files}
      ├── stamp/
      │   └── {files}
      └── other/
          └── {files}
```

---

## 🎯 Proposed Structure

### Proposed Firestore Structure:
**Status: ✅ Already Correct!**
- All company data is already inside `companies/{companyId}/` subcollections
- No changes needed for Firestore structure

### Proposed Firebase Storage Structure:
```
companies/
  └── {companyId}__{companyName}/          ← Root folder with UID + Name
      │
      ├── vouchers/                         ← Voucher files category
      │   ├── sale/
      │   │   └── {year}/
      │   │       └── {month}/
      │   │           └── {date}/          ← yyyy-MM-dd format
      │   │               └── {voucherId}/
      │   │                   └── {timestamp}_{filename}
      │   ├── purchase/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   ├── payment-in/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   ├── payment-out/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   ├── journal/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   ├── contra/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   ├── note/
      │   │   └── {year}/{month}/{date}/{voucherId}/{files}
      │   └── add-salary/
      │       └── {year}/{month}/{date}/{voucherId}/{files}
      │
      ├── avatar/                           ← Avatar files
      │   └── {year}/
      │       └── {month}/
      │           └── {date}/
      │               └── {timestamp}_{filename}
      │
      ├── stamp/                            ← Stamp files
      │   └── {year}/
      │       └── {month}/
      │           └── {date}/
      │               └── {timestamp}_{filename}
      │
      ├── unassigned/                       ← Unassigned files
      │   └── {year}/
      │       └── {month}/
      │           └── {date}/
      │               └── {timestamp}_{filename}
      │
      └── other/                            ← Other category files
          └── {year}/
              └── {month}/
                  └── {date}/
                      └── {timestamp}_{filename}
```

---

## 📝 Detailed Structure Examples

### Example 1: Voucher File Path
**Company:** "My Company" (ID: `abc123`)
**Voucher:** Sale voucher on 2026-01-24 (ID: `sale-001`)

**Path:**
```
companies/abc123__my-company/vouchers/sale/2026/01/2026-01-24/sale-001/1737654321000_invoice.pdf
```

### Example 2: Avatar File Path
**Company:** "My Company" (ID: `abc123`)
**Date:** 2026-01-24

**Path:**
```
companies/abc123__my-company/avatar/2026/01/2026-01-24/1737654321000_profile.jpg
```

### Example 3: Unassigned File Path
**Company:** "My Company" (ID: `abc123`)
**Date:** 2026-01-24

**Path:**
```
companies/abc123__my-company/unassigned/2026/01/2026-01-24/1737654321000_document.pdf
```

---

## 🔄 Changes Required

### 1. Storage Path Generation Functions

**File:** `src/lib/storage.ts`

#### Current Functions:
- ✅ `generateVoucherPath()` - Already has year/month/date structure
- ✅ `generateUnassignedPath()` - Has year/month but missing date
- ⚠️ `uploadFile()` - Needs update for avatar, stamp, other categories

#### Changes Needed:

1. **Update `generateUnassignedPath()`:**
   ```typescript
   // Current: companies/{companyKey}/unassigned/{year}/{month}/{uniqueName}
   // Proposed: companies/{companyKey}/unassigned/{year}/{month}/{date}/{uniqueName}
   ```

2. **Add `generateAvatarPath()`:**
   ```typescript
   companies/{companyKey}/avatar/{year}/{month}/{date}/{uniqueName}
   ```

3. **Add `generateStampPath()`:**
   ```typescript
   companies/{companyKey}/stamp/{year}/{month}/{date}/{uniqueName}
   ```

4. **Add `generateOtherPath()`:**
   ```typescript
   companies/{companyKey}/other/{year}/{month}/{date}/{uniqueName}
   ```

5. **Update `uploadFile()` function:**
   - Add date parameter for all categories
   - Use new path generators for avatar, stamp, other

### 2. Files That Need Updates

#### Primary Files:
1. **`src/lib/storage.ts`**
   - Update path generation functions
   - Add date-based folder structure for all categories
   - Add `generateAvatarPath()`, `generateStampPath()`, `generateOtherPath()`
   - Update `uploadFile()` to accept date parameter for all categories

#### Components Using Direct Storage Ref (Need to Update):
1. **`src/components/party/CreatePartyForm.tsx`**
   - Currently: `party-files/${companyId}/${Date.now()}_${file.name}`
   - Should use: `uploadFile()` with `category: "avatar"` and date

2. **`src/components/party/EditPartyDialog.tsx`**
   - Currently: Direct storage ref
   - Should use: `uploadFile()` with `category: "avatar"` and date

3. **`src/components/staff/CreateStaffForm.tsx`**
   - Currently: `staff-files/${companyId}/${Date.now()}_${file.name}`
   - Should use: `uploadFile()` with `category: "avatar"` and date

4. **`src/components/staff/EditStaffDialog.tsx`**
   - Currently: `staff-files/${companyId}/${Date.now()}_${file.name}`
   - Should use: `uploadFile()` with `category: "avatar"` and date

5. **`src/components/items/CreateItemDialog.tsx`**
   - Currently: `item-files/${companyId}/${Date.now()}_${file.name}`
   - Should use: `uploadFile()` with `category: "avatar"` or appropriate category and date

6. **`src/components/items/EditItemDialog.tsx`**
   - Currently: `item-files/${companyId}/${Date.now()}_${file.name}`
   - Should use: `uploadFile()` with appropriate category and date

#### Components Using uploadFile() Function:
1. **`src/app/(dashboard)/gallery/page.tsx`**
   - Uses `uploadFile()` with `category: "unassigned"`
   - Needs: Add date parameter (currently missing)

#### Secondary Files (if needed):
- Any other component that uploads files directly to storage

---

## ✅ Implementation Plan

### Phase 1: Update Storage Path Functions
1. Update `generateUnassignedPath()` to include date
2. Create `generateAvatarPath()`
3. Create `generateStampPath()`
4. Create `generateOtherPath()`
5. Update `uploadFile()` to use date for all categories

### Phase 2: Update File Upload Calls
1. **Update `uploadFile()` calls:**
   - Find all `uploadFile()` calls with `category: "unassigned"` → Add date parameter
   - Find all `uploadFile()` calls with `category: "avatar"` → Add date parameter
   - Find all `uploadFile()` calls with `category: "stamp"` → Add date parameter
   - Find all `uploadFile()` calls with `category: "other"` → Add date parameter

2. **Replace direct storage refs with `uploadFile()`:**
   - `CreatePartyForm.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`
   - `EditPartyDialog.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`
   - `CreateStaffForm.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`
   - `EditStaffDialog.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`
   - `CreateItemDialog.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`
   - `EditItemDialog.tsx` - Replace direct ref with `uploadFile(..., "avatar", undefined, new Date())`

### Phase 3: Migration (Optional)
- Existing files will remain in old structure
- New files will use new structure
- Can add migration script later if needed

---

## 📊 Structure Comparison

| Category | Current Structure | Proposed Structure |
|----------|------------------|-------------------|
| **Vouchers** | ✅ `vouchers/{type}/{year}/{month}/{day}/{voucherId}/{file}` | ✅ Same (Already correct) |
| **Unassigned** | ⚠️ `unassigned/{year}/{month}/{file}` | ✅ `unassigned/{year}/{month}/{date}/{file}` |
| **Avatar** | ⚠️ `avatar/{file}` | ✅ `avatar/{year}/{month}/{date}/{file}` |
| **Stamp** | ⚠️ `stamp/{file}` | ✅ `stamp/{year}/{month}/{date}/{file}` |
| **Other** | ⚠️ `other/{file}` | ✅ `other/{year}/{month}/{date}/{file}` |

---

## 🎯 Benefits

1. **Better Organization:** All files organized by date for easy browsing
2. **Consistent Structure:** All categories follow same pattern
3. **Easy Cleanup:** Can delete files by date range easily
4. **Better Performance:** Smaller folder sizes per date
5. **Clear Hierarchy:** Company → Category → Year → Month → Date → Files

---

## ⚠️ Important Notes

1. **Firestore Structure:** Already correct, no changes needed
2. **Backward Compatibility:** Old files will remain in old structure
3. **Migration:** Can be done later if needed
4. **Company Name:** Already using `{companyId}__{slugify(companyName)}` format ✅

---

## 📋 Summary

### Firestore Structure:
**Status:** ✅ **Already Correct!**
- All company data is already inside `companies/{companyId}/` subcollections
- No changes needed

### Firebase Storage Structure:
**Status:** ⚠️ **Needs Updates**

| Category | Current Path | Proposed Path | Status |
|----------|-------------|---------------|--------|
| **Vouchers** | `vouchers/{type}/{year}/{month}/{day}/{voucherId}/{file}` | ✅ Same | Already correct |
| **Unassigned** | `unassigned/{year}/{month}/{file}` | `unassigned/{year}/{month}/{date}/{file}` | ⚠️ Add date |
| **Avatar** | `avatar/{file}` OR `staff-files/{companyId}/{file}` | `avatar/{year}/{month}/{date}/{file}` | ⚠️ Add folders |
| **Stamp** | `stamp/{file}` | `stamp/{year}/{month}/{date}/{file}` | ⚠️ Add folders |
| **Other** | `other/{file}` | `other/{year}/{month}/{date}/{file}` | ⚠️ Add folders |

### Files to Update:

#### Core Storage Functions:
1. **`src/lib/storage.ts`** (Main file)
   - Update `generateUnassignedPath()` - Add date folder
   - Add `generateAvatarPath()` - New function
   - Add `generateStampPath()` - New function
   - Add `generateOtherPath()` - New function
   - Update `uploadFile()` - Accept date for all categories

#### Components Using Direct Storage Refs:
2. **`src/components/party/CreatePartyForm.tsx`**
   - Replace: `party-files/${companyId}/${Date.now()}_${file.name}`
   - With: `uploadFile(..., "avatar", undefined, new Date())`

3. **`src/components/party/EditPartyDialog.tsx`**
   - Replace direct storage ref with `uploadFile(..., "avatar", undefined, new Date())`

4. **`src/components/staff/CreateStaffForm.tsx`**
   - Replace: `staff-files/${companyId}/${Date.now()}_${file.name}`
   - With: `uploadFile(..., "avatar", undefined, new Date())`

5. **`src/components/staff/EditStaffDialog.tsx`**
   - Replace: `staff-files/${companyId}/${Date.now()}_${file.name}`
   - With: `uploadFile(..., "avatar", undefined, new Date())`

6. **`src/components/items/CreateItemDialog.tsx`**
   - Replace: `item-files/${companyId}/${Date.now()}_${file.name}`
   - With: `uploadFile(..., "avatar", undefined, new Date())`

7. **`src/components/items/EditItemDialog.tsx`**
   - Replace: `item-files/${companyId}/${Date.now()}_${file.name}`
   - With: `uploadFile(..., "avatar", undefined, new Date())`

#### Components Using uploadFile():
8. **`src/app/(dashboard)/gallery/page.tsx`**
   - Update: `uploadFile(..., 'unassigned')` → Add date parameter

---

## 🎯 Final Structure Example

**Company:** "My Company" (ID: `abc123`, Name: "My Company")

### Complete Path Examples:

1. **Voucher File:**
   ```
   companies/abc123__my-company/vouchers/sale/2026/01/2026-01-24/sale-001/1737654321000_invoice.pdf
   ```

2. **Party Avatar:**
   ```
   companies/abc123__my-company/avatar/2026/01/2026-01-24/1737654321000_party-profile.jpg
   ```

3. **Staff Avatar:**
   ```
   companies/abc123__my-company/avatar/2026/01/2026-01-24/1737654321000_staff-profile.jpg
   ```

4. **Item File:**
   ```
   companies/abc123__my-company/avatar/2026/01/2026-01-24/1737654321000_item-image.jpg
   ```

5. **Unassigned Document:**
   ```
   companies/abc123__my-company/unassigned/2026/01/2026-01-24/1737654321000_document.pdf
   ```

6. **Stamp File:**
   ```
   companies/abc123__my-company/stamp/2026/01/2026-01-24/1737654321000_stamp.png
   ```

---

**Ready to proceed?** Please review this plan and let me know if you want any changes before implementation.
