# Permission Enforcement - Implementation Summary

## Overview

This document summarizes the permission enforcement implementation beyond UI gating. The system now enforces permissions at the route/page level, mutation level, and includes backdate limit checks.

---

## 1. Route/Page Guards

**Component:** `src/components/permission/PermissionRouteGuard.tsx`

**Behavior:**
- Shows loading spinner while permissions are loading
- Owner role always has access
- If permission denied → shows "Access Denied" card with "Go Back" and "Go to Dashboard" buttons
- Supports `permission` (single) or `permissionAny` (array - show if user has ANY)

**Pages Protected:**

| Page | Permission(s) | File |
|------|---------------|------|
| Backup & Restore | `export_data` OR `import_data` | `src/app/(dashboard)/backup/page.tsx` |
| Reports | `export_data` | `src/app/(dashboard)/reports/page.tsx` |
| Recycle Bin | `delete_records` | `src/app/(dashboard)/recycle-bin/page.tsx` |
| Settings > Manage Sharing | `manage_users_roles` | `src/app/(dashboard)/settings/page.tsx` (wrapped ManageShare component) |

**Implementation Pattern:**
```tsx
export default function PageName() {
  return (
    <PermissionRouteGuard permission="permission_key">
      <PageContent />
    </PermissionRouteGuard>
  );
}
```

---

## 2. Mutation-Level Enforcement

**Helper:** `src/lib/permissions/enforcePermission.ts`

**Functions:**
- `assertCan(canFn, permissionKey, customMessage?)` - Throws `PermissionDeniedError` if denied
- `assertCanPerformBackdated(canPerformFn, action, recordDate, customMessage?)` - Checks backdate limits
- `assertCanEdit(canEditFn, isOwnRecord, customMessage?)` - Checks edit_own vs edit_all

**Error Handling:**
- All functions throw `PermissionDeniedError` which is caught and shown as toast
- Toast message: "Permission Denied" with error message

**Mutations Protected:**

### Voucher Operations

| Operation | Permission Check | Files Modified |
|-----------|------------------|----------------|
| **Create Voucher** | `create_records` + backdate limit | All `Create*Form.tsx` components |
| **Edit Voucher** | `canEditRecord(isOwnRecord)` + backdate limit | All `Create*Form.tsx` components |
| **Delete to Bin** | `delete_records` + backdate limit | All `Create*Form.tsx` components (handleDelete) |

**Files with Mutation Guards:**
- `src/components/vouchers/CreateSaleForm.tsx`
- `src/components/vouchers/CreatePurchaseForm.tsx`
- `src/components/vouchers/CreatePaymentInForm.tsx`
- `src/components/vouchers/CreatePaymentOutForm.tsx`
- `src/components/vouchers/CreateJournalForm.tsx`
- `src/components/vouchers/CreateContraForm.tsx`
- `src/components/vouchers/CreateNoteForm.tsx`
- `src/components/vouchers/SalaryForm.tsx`

**Implementation Pattern:**
```tsx
try {
  // Permission check: create or edit
  const isEdit = !!voucher?.id || !!savedVoucherId;
  const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
  
  if (isEdit) {
    const isOwnRecord = voucher?.userId === user.uid;
    assertCanEdit(canEditRecord, isOwnRecord);
    assertCanPerformBackdated(canPerformBackdatedAction, "edit", voucherDate);
  } else {
    assertCan(can, "create_records");
    assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate);
  }
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    sonnerToast.error("Permission Denied", { description: error.message });
  }
  return;
}
```

### Recycle Bin Operations

| Operation | Permission Check | File |
|-----------|------------------|------|
| **Restore** | `delete_records` | `src/app/(dashboard)/recycle-bin/page.tsx` |
| **Permanent Delete** | `permanently_delete_records` | `src/app/(dashboard)/recycle-bin/page.tsx` |

### Backup/Restore Operations

| Operation | Permission Check | File |
|-----------|------------------|------|
| **Create Backup** | `export_data` | `src/components/settings/BackupRestore.tsx` |
| **Restore Data** | `import_data` | `src/components/settings/BackupRestore.tsx` |

### User/Role Management

| Operation | Permission Check | File |
|-----------|------------------|------|
| **Save Permissions** | `manage_users_roles` | `src/components/company/ManageShare.tsx` |
| **Change User Role** | `manage_users_roles` | `src/components/company/ManageShare.tsx` |
| **Remove User Access** | `manage_users_roles` | `src/components/company/ManageShare.tsx` |

### Report Export

| Operation | Permission Check | Files |
|-----------|------------------|-------|
| **Print Report** | `export_data` | All report pages (bank-statement, group-statement, staff-statement, contra-report, DesktopPartyStatementPage) |
| **Export to Excel** | `export_data` | All report pages |

**Implementation Pattern:**
```tsx
const handlePrint = () => {
  try {
    assertCan(can, "export_data");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: error.message,
      });
    }
    return;
  }
  // ... proceed with print
};
```

---

## 3. Backdate Limits Enforcement

**Hook Enhancement:** `src/hooks/usePermissions.tsx`

**Function:** `canPerformBackdatedAction(action: 'entry' | 'edit' | 'delete', recordDate?: Date)`

**Logic:**
- Owner: always `true`
- If `recordDate` not provided: `true`
- If limit is `0` or `>= 9999`: `true` (no limit)
- Otherwise: calculates days difference and compares with limit

**Date Calculation:**
```typescript
const now = new Date();
const recordDay = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const ageInDays = Math.floor((today.getTime() - recordDay.getTime()) / (1000 * 60 * 60 * 24));
return ageInDays <= limit;
```

**Applied To:**
- ✅ Voucher create: `assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate)`
- ✅ Voucher edit: `assertCanPerformBackdated(canPerformBackdatedAction, "edit", voucherDate)`
- ✅ Voucher delete: `assertCanPerformBackdated(canPerformBackdatedAction, "delete", voucherDate)`

**Error Messages:**
- Default: "Creating/Editing/Deleting vouchers with this date is not allowed based on your role's date limits."
- Custom messages can be provided via `assertCanPerformBackdated` third parameter

---

## 4. Owner Role Selection Fix

**File:** `src/components/company/ManageShare.tsx`

**Changes:**
1. **Removed "Owner" from role dropdown** - Only ownerEmail can be Owner (role is fixed, dropdown disabled for owner)
2. **Added validation in `handleRoleChange`**:
   - If user selects "owner" → shows toast: "Only the company owner can be Owner role." and returns early
   - Normalizes role to lowercase: `normalizedRole = newRole.toLowerCase() as UserRole`
   - Validates role is in allowed list: `["viewer", "data-entry", "accountant", "editor", "manager"]`

**Code:**
```typescript
if (newRole === "owner") {
  toast({ 
    variant: "destructive", 
    title: "Invalid Role", 
    description: "Only the company owner can be Owner role." 
  });
  return;
}

const normalizedRole = newRole.toLowerCase() as UserRole;
if (!["viewer", "data-entry", "accountant", "editor", "manager"].includes(normalizedRole)) {
  toast({ variant: "destructive", title: "Invalid Role", description: "Invalid role selected." });
  return;
}
```

---

## 5. Files Modified

### New Files

- `src/components/permission/PermissionRouteGuard.tsx` - Route guard component
- `src/lib/permissions/enforcePermission.ts` - Permission assertion helpers

### Modified Files

**Route Guards:**
- `src/app/(dashboard)/backup/page.tsx`
- `src/app/(dashboard)/reports/page.tsx`
- `src/app/(dashboard)/recycle-bin/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`

**Voucher Forms (Mutation Guards + Backdate Limits):**
- `src/components/vouchers/CreateSaleForm.tsx`
- `src/components/vouchers/CreatePurchaseForm.tsx`
- `src/components/vouchers/CreatePaymentInForm.tsx`
- `src/components/vouchers/CreatePaymentOutForm.tsx`
- `src/components/vouchers/CreateJournalForm.tsx`
- `src/components/vouchers/CreateContraForm.tsx`
- `src/components/vouchers/CreateNoteForm.tsx`
- `src/components/vouchers/SalaryForm.tsx`

**Recycle Bin:**
- `src/app/(dashboard)/recycle-bin/page.tsx` - Restore & Permanent Delete guards

**Backup/Restore:**
- `src/components/settings/BackupRestore.tsx` - Backup & Restore mutation guards

**User Management:**
- `src/components/company/ManageShare.tsx` - Owner role fix + permission checks for save/change/remove

**Reports:**
- `src/app/(dashboard)/reports/bank-statement/page.tsx` - Print/Excel guards
- `src/app/(dashboard)/reports/group-statement/page.tsx` - Print/Excel guards (via PermissionButton)
- `src/app/(dashboard)/reports/staff-statement/page.tsx` - Print/Excel guards (via PermissionButton)
- `src/app/(dashboard)/reports/contra-report/page.tsx` - Print/Excel guards (via PermissionButton)
- `src/components/reports/DesktopPartyStatementPage.tsx` - Print/Excel guards (via PermissionButton)

---

## 6. Permission Keys Used

| Key | Enforcement Location |
|-----|---------------------|
| `create_records` | All voucher create operations |
| `edit_own_records` / `edit_all_records` | All voucher edit operations (via `canEditRecord`) |
| `delete_records` | Voucher delete to bin, Recycle bin restore |
| `permanently_delete_records` | Recycle bin permanent delete |
| `export_data` | Report Print/Excel, Backup, Reports page guard |
| `import_data` | Restore, Backup & Restore page guard |
| `manage_users_roles` | ManageShare: save permissions, change role, remove user, Settings page guard |

---

## 7. Error Handling

**Pattern:**
1. Try-catch around permission checks
2. If `PermissionDeniedError` → show toast with error message
3. Return early to prevent mutation
4. For non-permission errors → show generic error toast

**Example:**
```tsx
try {
  assertCan(can, "create_records");
  assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate);
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    sonnerToast.error("Permission Denied", { description: error.message });
  } else {
    sonnerToast.error("Error", { description: "Failed to check permissions." });
  }
  return;
}
```

---

## 8. Backdate Limit Messages

**Default Messages:**
- Create: "Creating vouchers with this date is not allowed based on your role's date limits."
- Edit: "Editing vouchers with this date is not allowed based on your role's date limits."
- Delete: "Deleting vouchers with this date is not allowed based on your role's date limits."

**Custom messages** can be provided via `assertCanPerformBackdated` fourth parameter.

---

## 9. Owner Role Behavior

- **Owner always has access** - All permission checks return `true` for owner
- **Owner role is fixed** - Cannot be selected in dropdown, only ownerEmail has this role
- **Owner bypasses date limits** - `canPerformBackdatedAction` returns `true` for owner regardless of date

---

## 10. Testing Checklist

### Route Guards
- [ ] Direct URL to `/backup` without permission → Access Denied
- [ ] Direct URL to `/reports` without `export_data` → Access Denied
- [ ] Direct URL to `/recycle-bin` without `delete_records` → Access Denied
- [ ] Direct URL to `/settings?view=sharing` without `manage_users_roles` → Access Denied
- [ ] Owner can access all pages

### Mutation Guards
- [ ] Create voucher without `create_records` → Toast "Permission Denied"
- [ ] Edit own voucher without `edit_own_records` → Toast "Permission Denied"
- [ ] Edit other's voucher without `edit_all_records` → Toast "Permission Denied"
- [ ] Delete voucher without `delete_records` → Toast "Permission Denied"
- [ ] Permanent delete without `permanently_delete_records` → Toast "Permission Denied"
- [ ] Export report without `export_data` → Toast "Permission Denied"
- [ ] Restore without `import_data` → Toast "Permission Denied"
- [ ] Change user role without `manage_users_roles` → Toast "Permission Denied"

### Backdate Limits
- [ ] Create voucher older than `entryDays` limit → Toast with date limit message
- [ ] Edit voucher older than `editDays` limit → Toast with date limit message
- [ ] Delete voucher older than `deleteDays` limit → Toast with date limit message
- [ ] Owner can create/edit/delete regardless of date

### Owner Role Fix
- [ ] Cannot select "owner" role in dropdown (option removed)
- [ ] If somehow "owner" is selected → Toast "Only the company owner can be Owner role."
- [ ] Owner's role dropdown is disabled
- [ ] Roles stored are lowercase and valid

---

## 11. Notes

- **Server Actions:** `saveVoucher` in `src/lib/actions.ts` and `src/lib/voucher-actions.ts` are server actions. Permission checks are done in client components before calling these functions. Server-side enforcement would require additional implementation.
- **Date Limits:** Already implemented in `usePermissions.canPerformBackdatedAction` - just needed to be applied to operations.
- **Error Messages:** All use consistent "Permission Denied" title with descriptive messages.
- **No Layout Changes:** All changes are permission checks only, no UI layout modifications.
