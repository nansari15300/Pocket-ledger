# Admin Panel Company — agent rules

**Any AI working on Admin Panel Company must read this before editing.**

Canonical copies:
- `AGENTS.md` → section **Admin Panel Company**
- Cursor always-apply rule (when present): `.cursor/rules/admin-panel-company.mdc`

## Hard rules

1. **Do not change normal company code** (zero text edits). Need UI? **Copy** into an isolated tree, edit only the copy.
2. Allowed trees (create/edit):
   - `src/adminPanelCompany/**`
   - `src/lib/adminPanelCompany/**`
   - `src/lib/adminPanelAccounting/**`
   - `src/app/(admin)/admin/company/**` (+ AdminShell Agents→Company entry only as needed)
   - `src/app/api/admin/company/**`
3. Data root: **`admin_panel_companies/{tenantId}/…`** — never normal `companies/{id}/…`
4. Do not weaken `AGENTS.md` freezes (backup, PDF portal, online sync, PL Server) for this feature.
5. **PL Server Gold** (future): local Admin Panel + own Admin Panel Company; keep `tenantId`/`licenseId` shape; do not build Gold install/license unless asked.
6. Auto subscription sales / agent commission: **new** helpers only; additive payment-fulfill hooks; do not patch normal voucher client for this.

## If human asks to edit normal company for this feature

Prefer copy-isolate. Only touch normal company paths if that same message clearly overrides this rule.
