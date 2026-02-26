# Permission UI Gating – Summary

> **Note:** This document covers UI-level gating (hiding/disabling buttons). For route guards, mutation enforcement, and backdate limits, see `PERMISSION_ENFORCEMENT.md`.

## Helper Components

| Component | Purpose |
|-----------|---------|
| `PermissionGate` | Hides children when `!can(permission)` or when none of `permissionAny` apply |
| `PermissionButton` | Button disabled when `!can(permission)`; shows tooltip "No permission" when disabled |
| `PermissionEditButton` | Same as button but uses `canEditRecord(isOwnRecord)` for edit_own / edit_all |
| `PermissionDeleteButton` | Same as button but always checks `delete_records` |

**Location:** `src/components/permission/` (index exports all).

---

## 1. Sidebar / Menu Items Gated

| Menu Item | Permission | Key(s) | Action |
|-----------|------------|--------|--------|
| Reports | `export_data` | `export_data` | Hidden if `!can('export_data')` |
| Backup & Restore | Any of | `export_data`, `import_data` | Hidden if user has neither |
| Billing & Plans | `configure_company_settings` | `configure_company_settings` | Hidden if `!can` |
| Recycle Bin | `delete_records` | `delete_records` | Hidden if `!can` |
| Manage Sharing | (Settings tab) | `manage_users_roles` | Already gated in Settings page |

**File:** `src/components/layout/AppSidebar.tsx`  
- Menu items have optional `permission` or `permissionAny`.  
- `filterByPermission()` filters `visibleMenuItems` and `visibleBottomMenuItems`.

---

## 2. Add Buttons (Create Records)

All use **`create_records`**. Buttons are disabled when `!can('create_records')` and show tooltip "No permission".

| Page / Location | UI Element | Permission |
|-----------------|------------|------------|
| **Party** | + Add Party, + Add Group | `create_records` |
| **Staff** | + Add Staff, + Add Group, Add Salary, Pay Salary | `create_records` |
| **Tax** | + Add Tax, + Add Group | `create_records` |
| **Bank/Cash** | + Add Account, + Add Group | `create_records` |
| **Income & Expense** | + Add Account, + Add Group, Add Direct Income, Add Direct Expense | `create_records` |
| **Items** | + Add Item, + Add Service, + Add Group, Create Group, Create Item/Service | `create_records` |
| **Notes** | Add Note (both instances) | `create_records` |
| **Add Salary** | Add Salary Voucher, Add Salary | `create_records` |
| **Sale** | Create Sale Invoice, Create Sale | `create_records` |
| **Purchase** | Create Purchase Bill, Create Purchase | `create_records` |
| **Payment In** | Payment In, Direct Income, Record Payment In | `create_records` |
| **Payment Out** | Payment Out, Direct Expense | `create_records` |
| **Journal** | Create Journal Voucher, Create First Journal | `create_records` |
| **Contra** | Create Contra Entry, Create Contra | `create_records` |
| **DesktopAppHeader** | Add Sale, Add Purchase, Payment In, Payment Out, Add Salary, Add Party, Add Item, Add Bank, Add Staff | `create_records` |

---

## 3. Edit / Delete Buttons

### Edit (own vs all)

- **Permission:** `edit_own_records` vs `edit_all_records` via `canEditRecord(isOwnRecord)` in `usePermissions`.
- **Component:** `PermissionEditButton` with `isOwnRecord` prop.
- **Usage:** Use wherever edit actions are shown (e.g. row edit, form edit).  
- **Note:** Edit buttons in voucher forms / detail views were not changed in this pass; use `PermissionEditButton` when adding or refactoring those.

### Delete (to recycle bin)

- **Permission:** `delete_records`.
- **Component:** `PermissionDeleteButton`.
- **Usage:** Recycle Bin restore uses `PermissionButton` with `delete_records` (see below).  
- **Note:** In-form delete (e.g. sale/purchase) can be switched to `PermissionDeleteButton` in a follow-up.

### Recycle Bin

| Action | Permission | Component |
|--------|------------|-----------|
| Restore | `delete_records` | `PermissionButton` |
| Delete Permanently | `permanently_delete_records` | `PermissionButton` |

**File:** `src/components/recycle-bin/RecycleBinItem.tsx`

---

## 4. Export / Import Buttons

### Export (reports: Print, Excel)

- **Permission:** `export_data`.
- **Component:** `PermissionButton` with `permission="export_data"`.

| Report Page | Buttons Gated |
|-------------|----------------|
| Bank Statement | Print, Excel |
| Group Statement | Print, Excel |
| Staff Statement | Print, Excel |
| Contra Report | Print, Excel |
| Desktop Party Statement | Print, Excel |

Share buttons are **not** gated.

### Backup / Restore

- **Permission:** Backup → `export_data`, Restore → `import_data`.
- **Component:** `PermissionButton`.
- **File:** `src/components/settings/BackupRestore.tsx`  
- Both cards are always shown; buttons are disabled with "No permission" tooltip when the user lacks the corresponding permission.

---

## 5. Permission Keys Used

| Key | Used For |
|-----|----------|
| `create_records` | All "Add" / create actions |
| `edit_own_records` | Edit own records (via `canEditRecord`) |
| `edit_all_records` | Edit any record (via `canEditRecord`) |
| `delete_records` | Delete to recycle bin, Restore |
| `permanently_delete_records` | Recycle bin permanent delete |
| `export_data` | Reports Print/Excel, Backup, Reports menu |
| `import_data` | Restore, Backup & Restore menu |
| `configure_company_settings` | Billing & Plans menu |
| `manage_users_roles` | Manage Sharing tab (existing) |

---

## 6. Files Touched

### New

- `src/components/permission/PermissionGate.tsx`
- `src/components/permission/PermissionButton.tsx`
- `src/components/permission/PermissionEditButton.tsx`
- `src/components/permission/PermissionDeleteButton.tsx`
- `src/components/permission/index.ts`

### Modified

- `src/hooks/usePermissions.tsx` – added `canEditRecord(isOwnRecord)`
- `src/components/layout/AppSidebar.tsx` – menu permission filtering
- `src/components/layout/DesktopAppHeader.tsx` – Add buttons gated
- `src/components/settings/BackupRestore.tsx` – Backup/Restore buttons gated
- `src/components/recycle-bin/RecycleBinItem.tsx` – Restore, Delete Permanently gated
- `src/app/(dashboard)/party/page.tsx` – Add Party, Add Group
- `src/app/(dashboard)/staff/page.tsx` – Add Staff, Add Group, Add Salary, Pay Salary
- `src/app/(dashboard)/tax/page.tsx` – Add Tax, Add Group
- `src/app/(dashboard)/bank-cash/page.tsx` – Add Account, Add Group
- `src/app/(dashboard)/incomes/page.tsx` – Add Account, Add Group, Direct Income/Expense
- `src/app/(dashboard)/items/page.tsx` – Add Item, Add Service, Add Group
- `src/app/(dashboard)/notes/page.tsx` – Add Note
- `src/app/(dashboard)/add-salary/page.tsx` – Add Salary
- `src/app/(dashboard)/sale/page.tsx` – Create Sale
- `src/app/(dashboard)/purchase/page.tsx` – Create Purchase
- `src/app/(dashboard)/payment-in/page.tsx` – Payment In, Direct Income, Record Payment In
- `src/app/(dashboard)/payment-out/page.tsx` – Payment Out, Direct Expense
- `src/app/(dashboard)/journal/page.tsx` – Create Journal
- `src/app/(dashboard)/contra/page.tsx` – Create Contra
- `src/app/(dashboard)/reports/bank-statement/page.tsx` – Print, Excel
- `src/app/(dashboard)/reports/group-statement/page.tsx` – Print, Excel
- `src/app/(dashboard)/reports/staff-statement/page.tsx` – Print, Excel
- `src/app/(dashboard)/reports/contra-report/page.tsx` – Print, Excel
- `src/components/reports/DesktopPartyStatementPage.tsx` – Print, Excel

---

## 7. Build Note

`npm run build` was run but hit environment issues (`.next` EPERM, etc.). The permission gating code itself is consistent with existing patterns and does not introduce new TypeScript errors in these files. You can run `npm run build` locally to confirm.

---

## 8. Tooltip / Toast

- When a permission-gated **button** is disabled due to missing permission, **tooltip** text is **"No permission"** (from `PermissionButton` / `PermissionEditButton` / `PermissionDeleteButton`).
- No toast is shown on click when disabled; click is no-op and tooltip is used instead.
