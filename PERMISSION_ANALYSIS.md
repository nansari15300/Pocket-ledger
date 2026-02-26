# Permission System Analysis & Implementation Plan

## 1. Permission Data Model

### Firestore Document Structure

**Path:** `companies/{companyId}`

**Fields:**
- `permissionConfig` (PermissionConfig type)
- `sharedWith` (Array<SharedUser>)
- `ownerEmail` (string)

### PermissionConfig TypeScript Structure

```typescript
type PermissionConfig = {
  permissions: Record<string, string[]>;  // Grouped permission labels
  roles: Record<UserRole, boolean[]>;      // Role-based permission flags (array of booleans)
  dateLimits: DateLimits;                 // Date-based restrictions per role
};

type DateLimits = {
  [key in UserRole]?: {
    entryDays: number;    // Days allowed for backdated entry
    editDays: number;     // Days allowed for editing old records
    deleteDays: number;   // Days allowed for deleting old records
  }
};

type UserRole = "viewer" | "data-entry" | "accountant" | "editor" | "manager" | "owner";

type SharedUser = {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
  photoURL?: string;
};
```

### Example JSON Data

```json
{
  "permissionConfig": {
    "permissions": {
      "General Access": ["View Own Records", "View All Records", "Create Records", ...],
      "Company & Users": ["Manage Users & Roles", "Configure Company Settings", ...],
      "Dashboard Summaries": ["View Receivable/Payable Summary", ...],
      "Special Accounts": ["Manage Special Bank Accounts", ...],
      "Pricing & Rate Control": ["Edit Item Rates in Vouchers"]
    },
    "roles": {
      "viewer": [true, false, false, false, false, false, false, false, false, false, true, false, true, true, true, false, false, false, false, false, false, false, false, false, false],
      "data-entry": [true, false, true, true, false, true, false, false, false, false, true, true, true, true, true, false, false, false, false, false, false, false, false, false, false],
      "accountant": [true, true, true, true, true, true, true, false, false, false, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false],
      "editor": [true, true, true, true, true, true, true, false, false, false, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false],
      "manager": [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, true],
      "owner": [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]
    },
    "dateLimits": {
      "viewer": { "entryDays": 0, "editDays": 0, "deleteDays": 0 },
      "data-entry": { "entryDays": 2, "editDays": 0, "deleteDays": 0 },
      "accountant": { "entryDays": 0, "editDays": 7, "deleteDays": 0 },
      "editor": { "entryDays": 3, "editDays": 5, "deleteDays": 5 },
      "manager": { "entryDays": 7, "editDays": 7, "deleteDays": 7 },
      "owner": { "entryDays": 9999, "editDays": 9999, "deleteDays": 9999 }
    }
  },
  "sharedWith": [
    {
      "email": "user@example.com",
      "name": "John Doe",
      "role": "accountant",
      "photoURL": "https://..."
    }
  ],
  "ownerEmail": "owner@example.com"
}
```

### Permission Keys (from lib/permissions.ts)

All 25 permissions in order:
1. `view_own_records`
2. `view_all_records`
3. `create_records`
4. `edit_own_records`
5. `edit_all_records`
6. `delete_records`
7. `approve_transactions`
8. `manage_users_roles`
9. `configure_company_settings`
10. `permanently_delete_records`
11. `export_data`
12. `import_data`
13. `view_receivable_payable_summary`
14. `view_payment_in_out_summary`
15. `view_entity_counts_summary`
16. `view_voucher_type_summaries`
17. `view_bank_cash_summary`
18. `view_daybook`
19. `view_recent_transactions`
20. `manage_special_bank_accounts`
21. `view_special_bank_accounts`
22. `view_owner_bank_account_details`
23. `view_special_account_balance`
24. `edit_item_rates_in_vouchers`

### Current Permission Reading

**Hook:** `src/hooks/usePermissions.tsx`

**How it works:**
1. Reads `company.permissionConfig` from Firestore (via `useCompany` hook)
2. Determines user role:
   - If `customUser.email === company.ownerEmail` → `role = 'owner'`
   - Else finds user in `company.sharedWith` array → uses `sharedUser.role`
   - Default: `role = 'viewer'`
3. Returns:
   - `can(permissionName: Permission): boolean` - checks permission
   - `role: UserRole` - current user's role
   - `dateLimits: DateLimits` - date restrictions for current role
   - `canPerformBackdatedAction(action: 'entry' | 'edit' | 'delete', recordDate?: Date): boolean` - checks date limits

**Current Usage:**
- ✅ Settings page (`src/app/(dashboard)/settings/page.tsx`) - filters nav items
- ✅ BackupRestore component - checks `export_data` and `import_data`

---

## 2. Areas Requiring Permission Enforcement

### 2.1 Voucher Operations

#### Create Voucher
- **Permission Required:** `create_records`
- **Date Check:** `canPerformBackdatedAction('entry', voucherDate)`
- **Files to Modify:**
  - `src/components/vouchers/CreateSaleForm.tsx`
  - `src/components/vouchers/CreatePurchaseForm.tsx`
  - `src/components/vouchers/CreatePaymentInForm.tsx`
  - `src/components/vouchers/CreatePaymentOutForm.tsx`
  - `src/components/vouchers/CreateJournalForm.tsx`
  - `src/components/vouchers/CreateContraForm.tsx`
  - `src/components/vouchers/CreateNoteForm.tsx`
  - `src/components/vouchers/SalaryForm.tsx`
  - `src/components/vouchers/CreateDirectIncomeForm.tsx`
- **Action Points:**
  - Disable/hide "Save" button if `!can('create_records')`
  - Check date before save: `canPerformBackdatedAction('entry', formData.date)`
  - Show error toast if permission denied

#### Edit Voucher
- **Permission Required:** 
  - `edit_own_records` (if voucher.userId === currentUser.uid)
  - `edit_all_records` (for any voucher)
- **Date Check:** `canPerformBackdatedAction('edit', voucher.date)`
- **Files to Modify:** (Same as Create - all form components handle both create and edit)
- **Action Points:**
  - Check permission before allowing edit mode
  - Disable save button if permission denied
  - Check date limits before saving edits

#### Delete Voucher (to Recycle Bin)
- **Permission Required:** `delete_records`
- **Date Check:** `canPerformBackdatedAction('delete', voucher.date)`
- **Files to Modify:**
  - `src/components/vouchers/CreateSaleForm.tsx` (handleDelete function)
  - `src/components/vouchers/CreatePurchaseForm.tsx` (handleDelete function)
  - All other voucher form components with delete functionality
- **Action Points:**
  - Hide/disable delete button if `!can('delete_records')`
  - Check date limits before deletion

#### Permanently Delete (from Recycle Bin)
- **Permission Required:** `permanently_delete_records`
- **Files to Modify:**
  - `src/app/(dashboard)/recycle-bin/page.tsx`
  - `src/app/(admin)/admin/recycle-bin/page.tsx`
- **Action Points:**
  - Hide/disable permanent delete button if `!can('permanently_delete_records')`

### 2.2 Reports Export (XLSX/PDF)

- **Permission Required:** `export_data`
- **Files to Modify:**
  - `src/app/(dashboard)/reports/bank-statement/page.tsx` (handleExcel function)
  - `src/app/(dashboard)/reports/group-statement/page.tsx` (handleExcel function)
  - `src/app/(dashboard)/reports/staff-statement/page.tsx` (handleExcel function)
  - `src/app/(dashboard)/reports/contra-report/page.tsx` (handleExcel function)
  - `src/components/reports/DesktopPartyStatementPage.tsx` (handleExcel function)
  - All other report pages with export functionality
- **Action Points:**
  - Hide/disable "Export to Excel" button if `!can('export_data')`
  - Hide/disable "Print/PDF" button if `!can('export_data')`
  - Show permission denied message

### 2.3 Bank/Cash Settings

#### Create Bank/Cash Account
- **Permission Required:** `manage_special_bank_accounts` (for special accounts) OR `configure_company_settings` (for regular accounts)
- **Files to Modify:**
  - `src/components/bank-cash/CreateBankAccountDialog.tsx`
  - `src/components/bank-cash/CreateBankAccountForm.tsx`
- **Action Points:**
  - Check if account is special → use `manage_special_bank_accounts`
  - Otherwise → use `configure_company_settings`
  - Disable form submission if permission denied

#### Edit Bank/Cash Account
- **Permission Required:** Same as create
- **Files to Modify:**
  - `src/components/bank-cash/EditAccountDialog.tsx`
- **Action Points:**
  - Disable edit button if permission denied
  - Check permissions before allowing form submission

#### View Bank/Cash Accounts
- **Permission Required:** 
  - `view_special_bank_accounts` (for special accounts)
  - `view_bank_cash_summary` (for viewing summary)
- **Files to Modify:**
  - `src/app/(dashboard)/bank-cash/page.tsx`
  - `src/components/bank-cash/page.tsx`
- **Action Points:**
  - Filter accounts based on permissions
  - Hide special accounts if `!can('view_special_bank_accounts')`

### 2.4 Manage Users & Roles

- **Permission Required:** `manage_users_roles`
- **Current Status:** ✅ Already partially enforced in settings page
- **Files to Verify:**
  - `src/app/(dashboard)/settings/page.tsx` (already checks `can('manage_users_roles')`)
  - `src/components/company/ManageShare.tsx` (should verify permission check)
- **Action Points:**
  - Ensure ManageShare component is only accessible with permission
  - Disable add/edit/remove user actions if permission denied

### 2.5 Import/Export (Backup/Restore)

- **Export Permission:** `export_data`
- **Import Permission:** `import_data`
- **Current Status:** ✅ Already enforced in BackupRestore component
- **Files to Verify:**
  - `src/components/settings/BackupRestore.tsx` (already has checks)
- **Action Points:**
  - Verify UI properly hides buttons when permission denied
  - Ensure server-side validation (if applicable)

### 2.6 Rate Editing in Vouchers

- **Permission Required:** `edit_item_rates_in_vouchers`
- **Files to Modify:**
  - `src/components/vouchers/CreateSaleForm.tsx` (rate editing fields)
  - `src/components/vouchers/CreatePurchaseForm.tsx` (rate editing fields)
- **Action Points:**
  - Disable rate input fields if `!can('edit_item_rates_in_vouchers')`
  - Check company settings: `company.allowRateEditing[sale/purchase]` (already exists)
  - Combine both checks: permission AND company setting

---

## 3. Files to Modify (Grouped by Feature)

### 3.1 Voucher Create/Edit/Delete

**Core Action Functions:**
- `src/lib/actions.ts` - `saveVoucher()` function
- `src/lib/voucher-actions.ts` - `saveVoucher()` function

**Voucher Form Components:**
- `src/components/vouchers/CreateSaleForm.tsx`
- `src/components/vouchers/CreatePurchaseForm.tsx`
- `src/components/vouchers/CreatePaymentInForm.tsx`
- `src/components/vouchers/CreatePaymentOutForm.tsx`
- `src/components/vouchers/CreateJournalForm.tsx`
- `src/components/vouchers/CreateContraForm.tsx`
- `src/components/vouchers/CreateNoteForm.tsx`
- `src/components/vouchers/SalaryForm.tsx`
- `src/components/vouchers/CreateDirectIncomeForm.tsx`

**Voucher Dialog Wrapper:**
- `src/components/vouchers/AddVoucherDialog.tsx` (may need permission checks)

### 3.2 Reports Export

**Report Pages with Export:**
- `src/app/(dashboard)/reports/bank-statement/page.tsx`
- `src/app/(dashboard)/reports/group-statement/page.tsx`
- `src/app/(dashboard)/reports/staff-statement/page.tsx`
- `src/app/(dashboard)/reports/contra-report/page.tsx`
- `src/components/reports/DesktopPartyStatementPage.tsx`
- `src/app/(dashboard)/reports/party-statement/page.tsx` (if exists)
- `src/app/(dashboard)/reports/party-ledger/page.tsx` (if has export)
- `src/app/(dashboard)/reports/financial-summary/page.tsx` (if has export)
- `src/app/(dashboard)/reports/profit-and-loss/page.tsx` (if has export)
- `src/app/(dashboard)/reports/balance-sheet/page.tsx` (if has export)
- `src/app/(dashboard)/reports/trial-balance/page.tsx` (if has export)
- `src/app/(dashboard)/reports/daybook/page.tsx` (if has export)
- `src/components/reports/DaybookReport.tsx` (if has export)
- `src/components/reports/FinancialSummary.tsx` (if has export)
- `src/components/reports/ProfitAndLoss.tsx` (if has export)
- `src/components/reports/BalanceSheet.tsx` (if has export)
- `src/components/reports/TrialBalance.tsx` (if has export)

### 3.3 Bank/Cash Settings

**Bank/Cash Components:**
- `src/components/bank-cash/CreateBankAccountDialog.tsx`
- `src/components/bank-cash/CreateBankAccountForm.tsx`
- `src/components/bank-cash/EditAccountDialog.tsx`
- `src/app/(dashboard)/bank-cash/page.tsx`
- `src/components/bank-cash/page.tsx`

### 3.4 Recycle Bin (Permanent Delete)

**Recycle Bin Pages:**
- `src/app/(dashboard)/recycle-bin/page.tsx`
- `src/app/(admin)/admin/recycle-bin/page.tsx`
- `src/components/recycle-bin/RecycleBinItem.tsx` (if has delete button)

### 3.5 Settings & User Management

**Settings Components:**
- `src/app/(dashboard)/settings/page.tsx` (✅ already has checks)
- `src/components/company/ManageShare.tsx` (verify permission checks)
- `src/components/settings/BackupRestore.tsx` (✅ already has checks)

---

## 4. Proposed Enforcement Strategy

### 4.1 UI-Level Enforcement

**Pattern:**
```typescript
import usePermissions from "@/hooks/usePermissions";

const { can, canPerformBackdatedAction, role } = usePermissions();

// Disable button
<Button disabled={!can('create_records')}>Save</Button>

// Hide button
{can('export_data') && <Button onClick={handleExcel}>Export</Button>}

// Conditional rendering
{can('delete_records') && canPerformBackdatedAction('delete', voucher.date) && (
  <Button onClick={handleDelete}>Delete</Button>
)}
```

**For Voucher Forms:**
1. Check `create_records` before allowing save (new voucher)
2. Check `edit_own_records` or `edit_all_records` before allowing save (edit mode)
3. Check `canPerformBackdatedAction('entry', date)` before creating
4. Check `canPerformBackdatedAction('edit', voucher.date)` before editing
5. Check `delete_records` + date limits before allowing delete

**For Reports:**
1. Hide/disable export buttons if `!can('export_data')`
2. Show tooltip/message explaining permission requirement

**For Bank/Cash:**
1. Check `manage_special_bank_accounts` for special accounts
2. Check `configure_company_settings` for regular accounts
3. Filter visible accounts based on `view_special_bank_accounts`

### 4.2 Server-Side Enforcement (Firestore Security Rules)

**Current Status:** Unknown - needs verification

**Recommended Rules:**
```javascript
// Example Firestore rules (needs verification)
match /companies/{companyId}/vouchers/{voucherId} {
  // Read: check view permissions
  allow read: if hasPermission(companyId, 'view_all_records') 
           || (hasPermission(companyId, 'view_own_records') && resource.data.userId == request.auth.uid);
  
  // Create: check create permission + date limits
  allow create: if hasPermission(companyId, 'create_records') 
            && checkDateLimit(companyId, 'entry', request.resource.data.date);
  
  // Update: check edit permission + date limits
  allow update: if (hasPermission(companyId, 'edit_all_records') 
                 || (hasPermission(companyId, 'edit_own_records') && resource.data.userId == request.auth.uid))
            && checkDateLimit(companyId, 'edit', resource.data.date);
  
  // Delete: check delete permission + date limits
  allow delete: if hasPermission(companyId, 'delete_records')
            && checkDateLimit(companyId, 'delete', resource.data.date);
}
```

**Note:** Firestore rules need custom functions to check permissions from company document.

### 4.3 Action-Level Enforcement

**In `saveVoucher()` function:**
```typescript
// Add permission check before saving
export async function saveVoucher(
  companyId: string,
  userId: string,
  voucherData: any,
  voucherId?: string | null
) {
  // TODO: Add permission check here
  // - For new voucher: check create_records + date limits
  // - For edit: check edit_own_records/edit_all_records + date limits
  // - Throw error if permission denied
  
  // ... existing code
}
```

**Challenges:**
- Server-side functions need access to company document
- May require Firebase Admin SDK or Cloud Functions
- Client-side checks are primary defense, server-side is backup

### 4.4 Date Limit Enforcement

**Implementation Pattern:**
```typescript
const { canPerformBackdatedAction } = usePermissions();

// Before saving voucher
if (!canPerformBackdatedAction('entry', formData.date)) {
  toast({
    variant: "destructive",
    title: "Permission Denied",
    description: `You cannot create vouchers dated more than ${dateLimits.entryDays} days in the past.`
  });
  return;
}

// Before editing
if (!canPerformBackdatedAction('edit', voucher.date)) {
  toast({
    variant: "destructive",
    title: "Permission Denied",
    description: `You cannot edit vouchers older than ${dateLimits.editDays} days.`
  });
  return;
}
```

---

## 5. Implementation Priority

### Phase 1: Critical Operations
1. ✅ Voucher create/edit/delete (highest priority)
2. ✅ Reports export (high priority)
3. ✅ Permanent delete from recycle bin

### Phase 2: Settings & Configuration
4. ✅ Bank/cash account management
5. ✅ Rate editing in vouchers
6. Verify user management permissions

### Phase 3: View-Level Permissions
7. Filter visible data based on view permissions
8. Dashboard summary visibility

---

## 6. Testing Checklist

### For Each Feature:
- [ ] Test with each role (viewer, data-entry, accountant, editor, manager, owner)
- [ ] Test date limit restrictions
- [ ] Test permission denied UI feedback
- [ ] Test "own records" vs "all records" distinction
- [ ] Test owner bypass (should always have access)
- [ ] Test edge cases (missing permissionConfig, invalid role, etc.)

### Specific Test Cases:
- [ ] Viewer cannot create vouchers
- [ ] Data-entry can create but not edit old vouchers
- [ ] Accountant can edit vouchers within 7 days
- [ ] Manager can edit/delete within 7 days
- [ ] Owner has full access regardless of date
- [ ] Export buttons hidden for users without export_data permission
- [ ] Special bank accounts hidden from users without view_special_bank_accounts

---

## 7. Notes & Considerations

1. **Owner Bypass:** Owner role always returns `true` for all permissions - this is already handled in `usePermissions` hook.

2. **Date Limits:** The `canPerformBackdatedAction` function already handles date calculations. Just need to call it at appropriate points.

3. **Own vs All Records:** Need to check `voucher.userId === currentUser.uid` to distinguish between `edit_own_records` and `edit_all_records`.

4. **Permission Config Default:** If `company.permissionConfig` is missing, `usePermissions` falls back to `initialPermissionConfig` - this is safe.

5. **Real-time Updates:** Permission changes in Firestore should reflect immediately since `useCompany` hook uses `onSnapshot`.

6. **UI/UX:** When permission is denied:
   - Show clear error messages
   - Disable buttons (don't just hide them - better UX)
   - Consider showing tooltips explaining why action is disabled

7. **Backward Compatibility:** Existing companies without `permissionConfig` will use default config, so no breaking changes.

---

## 8. Summary

**Total Files to Modify:** ~30-35 files

**Key Areas:**
1. 9 voucher form components
2. 15+ report pages
3. 4-5 bank/cash components
4. 2 recycle bin pages
5. 2 core action functions (saveVoucher)

**Current Status:**
- ✅ Permission system is fully defined and stored
- ✅ Permission reading hook (`usePermissions`) is ready
- ✅ Settings page already uses permissions
- ✅ BackupRestore already uses permissions
- ❌ Voucher operations: NO permission checks
- ❌ Reports export: NO permission checks
- ❌ Bank/cash: NO permission checks
- ❌ Recycle bin: NO permission checks

**Next Steps:**
1. Start with voucher create/edit/delete (highest impact)
2. Add reports export checks
3. Add bank/cash permission checks
4. Add permanent delete checks
5. Test thoroughly with all roles
