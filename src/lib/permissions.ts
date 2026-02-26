
export type Permission =
  | "view_own_records"
  | "view_all_records"
  | "create_records"
  | "edit_own_records"
  | "edit_all_records"
  | "delete_records"
  | "approve_transactions"
  | "edit_approved_voucher"
  | "delete_approved_voucher"
  | "view_history"
  | "manage_users_roles"
  | "configure_company_settings"
  | "permanently_delete_records"
  | "export_data"
  | "import_data"
  | "view_receivable_payable_summary"
  | "view_payment_in_out_summary"
  | "view_entity_counts_summary"
  | "view_voucher_type_summaries"
  | "view_bank_cash_summary"
  | "view_daybook"
  | "view_recent_transactions"
  | "manage_special_bank_accounts"
  | "view_special_bank_accounts"
  | "view_owner_bank_account_details"
  | "view_special_account_balance"
  | "edit_item_rates_in_vouchers"
  | "edit_voucher_numbers"
  | "view_voucher_history"
  | "reset_voucher_history"
  | "add_link"
  | "edit_link";

export type PermissionInfo = {
  key: Permission;
  label: string;
};

export type PermissionGroup = {
  title: string;
  permissions: PermissionInfo[];
};


export const PermissionGroups: PermissionGroup[] = [
    {
        title: "General Access",
        permissions: [
            { key: "view_own_records", label: "View Own Records" },
            { key: "view_all_records", label: "View All Records" },
            { key: "create_records", label: "Create Records" },
            { key: "edit_own_records", label: "Edit Own Records" },
            { key: "edit_all_records", label: "Edit All Records" },
            { key: "delete_records", label: "Delete Records (to Recycle Bin)" },
            { key: "approve_transactions", label: "Approve Transactions" },
            { key: "edit_approved_voucher", label: "Edit Approved Voucher" },
            { key: "delete_approved_voucher", label: "Delete Approved Voucher" },
            { key: "edit_voucher_numbers", label: "Edit Voucher Numbers" },
            { key: "view_voucher_history", label: "View Voucher History" },
            { key: "reset_voucher_history", label: "Reset Voucher History" },
        ],
    },
    {
        title: "Company & Users",
        permissions: [
            { key: "manage_users_roles", label: "Manage Users & Roles" },
            { key: "configure_company_settings", label: "Configure Company Settings" },
            { key: "permanently_delete_records", label: "Permanently Delete Records" },
            { key: "export_data", label: "Export Data" },
            { key: "import_data", label: "Import/Restore Data" },
        ],
    },
    {
        title: "Dashboard Summaries",
        permissions: [
            { key: "view_receivable_payable_summary", label: "View Receivable/Payable Summary" },
            { key: "view_payment_in_out_summary", label: "View Payment In/Out Summary" },
            { key: "view_entity_counts_summary", label: "View Entity Counts" },
            { key: "view_voucher_type_summaries", label: "View Voucher Type Summaries" },
            { key: "view_bank_cash_summary", label: "View Bank/Cash Summary" },
            { key: "view_daybook", label: "View Daybook" },
            { key: "view_recent_transactions", label: "View Recent Transactions" },
        ],
    },
    {
        title: "Special Accounts",
        permissions: [
            { key: "manage_special_bank_accounts", label: "Manage Special Bank Accounts" },
            { key: "view_special_bank_accounts", label: "View Special Bank Accounts" },
            { key: "view_owner_bank_account_details", label: "View Owner Bank Account Details" },
            { key: "view_special_account_balance", label: "View Special Account Balance" },
        ],
    },
    {
        title: "Pricing & Rate Control",
        permissions: [
            { key: "edit_item_rates_in_vouchers", label: "Edit Item Rates in Vouchers"},
        ]
    },
    {
        title: "Link / Allocation",
        permissions: [
            { key: "add_link", label: "Add Link (Link to Txns)" },
            { key: "edit_link", label: "Edit Link (Unlink / Change allocation)" },
        ]
    }
];

export const allPermissions = PermissionGroups.flatMap(group => group.permissions.map(p => p.key));
