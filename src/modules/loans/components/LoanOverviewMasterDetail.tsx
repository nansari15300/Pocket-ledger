"use client";

import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LoanLiabilityEntityIcon } from "@/components/entity/LoanLiabilityEntityIcon";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { mlc } from "@/lib/mobileListChrome";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoanStaffNavTitle } from "@/components/layout/LoanStaffNavTitle";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { PermissionButton } from "@/components/permission";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { type EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { resolveMasterListSelection } from "@/lib/masterEntityLiveUpdate";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import type { Staff, StaffGroup } from "@/components/staff/types";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { isLoanLiabilityStaff } from "../utils/loanLiabilityStaff";
import { LOAN_LIABILITY_GROUP_ID } from "../constants/loanConstants";
import { findLoanForAccount } from "../db/loanQueries";
import type { Loan, LoanDraftInput } from "../types/loanTypes";
import { resolveLoanAccountAvatarUrl } from "../utils/resolveLoanAccountAvatarUrl";
import { buildLoanGroupTree, loanAccountsForGroupSelection } from "../utils/loanGroupTree";
import { ConvertExistingBankAccountDialog } from "./ConvertExistingBankAccountDialog";
import { LoanAccountList } from "./LoanAccountList";
import { LoanAccountGroupList } from "./LoanAccountGroupList";
import { LoanWorkspaceDetails } from "./LoanWorkspaceDetails";

export function LoanOverviewMasterDetail({
  loans,
  selectedId,
  activeView,
  onSelectAccountId,
  onCreate,
  onReloadList,
}: {
  loans: Loan[];
  selectedId?: string | null;
  activeView: "accounts" | "groups";
  onSelectAccountId: (accountId: string | null, tab?: "accounts" | "groups") => void;
  onCreate: (initial?: Partial<LoanDraftInput>) => void;
  onReloadList?: () => Promise<void> | void;
}) {
  const { formatCurrencyForPrint } = useDate();
  const isMobile = useIsMobile();
  const { companyId } = useCompany();
  const { loading: vouchersLoading, processedStaff, processedStaffGroups, processedAccounts } = useVouchers();
  const [searchTerm, setSearchTerm] = useState("");
  const [accountListQuickFilter, setAccountListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupListQuickFilter, setGroupListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupMemberFilterId, setGroupMemberFilterId] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  const loanAccounts = useMemo(
    () => (processedStaff || []).filter((row) => isLoanLiabilityStaff(row)),
    [processedStaff]
  );

  const loanAccountsForList = useMemo(
    () =>
      loanAccounts.map((acc) => {
        const linkedLoan = findLoanForAccount(loans, acc.id);
        const avatar = resolveLoanAccountAvatarUrl(acc, linkedLoan, processedAccounts);
        return avatar ? { ...acc, fileUrl: avatar } : acc;
      }),
    [loanAccounts, loans, processedAccounts]
  );

  const loanGroupTree = useMemo(
    () =>
      buildLoanGroupTree({
        loanAccounts: loanAccountsForList,
        staffGroups: processedStaffGroups || [],
        companyId: companyId || "",
      }),
    [loanAccountsForList, processedStaffGroups, companyId]
  );

  const loanGroups = loanGroupTree.allGroups;

  const selected = useMemo(() => {
    const list = activeView === "accounts" ? loanAccounts : loanGroups;
    if (selectedId) {
      return list.find((row) => row.id === selectedId) || loanAccounts.find((row) => row.id === selectedId) || null;
    }
    if (!isMobile && activeView === "groups") return loanGroupTree.systemGroup;
    if (!isMobile && list.length > 0) return list[0]!;
    return null;
  }, [selectedId, activeView, loanAccounts, loanGroups, loanGroupTree.systemGroup, isMobile]);

  const selectedAccountRaw = activeView === "accounts" ? (selected as Staff | null) : null;
  const selectedAccount = useMemo(
    () => resolveMasterListSelection(selectedAccountRaw, loanAccounts),
    [selectedAccountRaw, loanAccounts]
  );
  const selectedGroup = activeView === "groups" ? (selected as StaffGroup | null) : null;

  const totalBalance = useMemo(() => {
    return loanAccounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  }, [loanAccounts]);

  const filteredAccountCount = useMemo(
    () => loanAccounts.filter((a) => a.name && masterEntityTextMatchesSearch(a.name, searchTerm)).length,
    [loanAccounts, searchTerm]
  );
  const filteredGroupCount = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return Math.max(1, loanGroupTree.childGroups.length || 1);
    const childMatches = loanGroupTree.childGroups.filter((g) =>
      masterEntityTextMatchesSearch(g.name, searchTerm)
    ).length;
    return childMatches > 0 ? childMatches : masterEntityTextMatchesSearch(loanGroupTree.systemGroup.name, searchTerm) ? 1 : 0;
  }, [loanGroupTree, searchTerm]);

  const accountsForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    return loanAccountsForGroupSelection(selectedGroup.id, loanAccountsForList, loanGroupTree);
  }, [selectedGroup, loanAccountsForList, loanGroupTree]);

  const groupMembersByGroupId = loanGroupTree.groupMembersByGroupId;

  const handleSelectAccount = useCallback(
    (account: Staff) => {
      setGroupMemberFilterId(null);
      onSelectAccountId(account.id, "accounts");
    },
    [onSelectAccountId]
  );

  const handleSelectGroup = useCallback(
    (group: StaffGroup, options?: GroupListSelectOptions) => {
      setGroupMemberFilterId(options?.memberId ?? null);
      onSelectAccountId(group.id, "groups");
    },
    [onSelectAccountId]
  );

  const handleTabChange = (next: string) => {
    const tab = next === "groups" ? "groups" : "accounts";
    setGroupMemberFilterId(null);
    setSearchTerm("");
    const list = tab === "groups" ? loanGroups : loanAccounts;
    const first =
      !isMobile && list.length > 0
        ? tab === "groups"
          ? LOAN_LIABILITY_GROUP_ID
          : list[0]!.id
        : null;
    onSelectAccountId(first, tab);
  };

  const linkedLoan = findLoanForAccount(loans, selectedAccount?.id);
  const detailAccount = groupMemberFilterId
    ? loanAccounts.find((a) => a.id === groupMemberFilterId) || null
    : selectedAccount;
  const groupMemberLoan = findLoanForAccount(loans, detailAccount?.id);

  const bankAccountsForConvert = useMemo(
    () =>
      (processedAccounts || []).map((a) => ({
        ...a,
        id: String(a.id || ""),
        accountName: bankAccountDisplayName(a) || String(a.id || ""),
      })),
    [processedAccounts]
  );

  if (vouchersLoading && loanAccounts.length === 0) {
    return <LoadingSpinner />;
  }

  const loanTabsEl = (
    <Tabs value={activeView} onValueChange={handleTabChange} className="w-full">
      <TabsList listChrome>
        <TabsTrigger listChrome value="accounts" className="flex-1">
          Accounts
        </TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1">
          Groups
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const searchRowEl = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={activeView === "groups" ? "Search groups..." : "Search accounts..."}
          listChrome
          listChromeSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      {activeView === "accounts" ? (
        <div className="flex shrink-0 items-center gap-1">
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => onCreate()}>
            + Add Account
          </PermissionButton>
          <PermissionButton
            permission="create_records"
            variant="chromePill"
            size="list"
            onClick={() => setConvertOpen(true)}
          >
            Add Existing
          </PermissionButton>
        </div>
      ) : null}
    </div>
  );

  const actionRowEl = undefined;

  const sectionLabelEl =
    activeView === "accounts" ? (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <LoanLiabilityEntityIcon className={mlc.sectionIcon} />
        <span>Accounts ({filteredAccountCount})</span>
      </div>
    ) : (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <LoanLiabilityEntityIcon className={mlc.sectionIcon} />
        <span>Groups ({filteredGroupCount})</span>
      </div>
    );

  const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={searchRowEl}
      actionRow={actionRowEl}
      sectionLabel={sectionLabelEl}
      tabs={loanTabsEl}
      quickFilter={activeView === "groups" ? groupListQuickFilter : accountListQuickFilter}
      onQuickFilterChange={activeView === "groups" ? setGroupListQuickFilter : setAccountListQuickFilter}
    >
      {activeView === "accounts" ? (
        <LoanAccountList
          accounts={loanAccountsForList}
          loans={loans}
          onSelectAccount={handleSelectAccount}
          selectedAccount={selectedAccount}
          searchTerm={searchTerm}
          quickFilter={accountListQuickFilter}
          onQuickFilterChange={setAccountListQuickFilter}
          hideQuickFilterBar
        />
      ) : (
        <LoanAccountGroupList
          systemGroup={loanGroupTree.systemGroup}
          childGroups={loanGroupTree.childGroups}
          groupMembersByGroupId={groupMembersByGroupId}
          loans={loans}
          bankAccounts={processedAccounts || []}
          onSelectGroup={handleSelectGroup}
          selectedGroup={selectedGroup}
          searchTerm={searchTerm}
          selectedGroupMemberFilterId={groupMemberFilterId}
          quickFilter={groupListQuickFilter}
          onQuickFilterChange={setGroupListQuickFilter}
          hideQuickFilterBar
        />
      )}
    </MasterListViewShell>
  );

  const emptyLoanSetup = (account: Staff) => (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
      <LoanLiabilityEntityIcon className="h-10 w-10 text-muted-foreground" />
      <div>
        <h2 className={cn("text-lg font-semibold", masterDetailBalanceToneClass(account.balance))}>{account.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is a loan payable ledger. Create a loan to manage EMI, interest, and journals.
        </p>
      </div>
      <PermissionButton
        permission="create_records"
        onClick={() =>
          onCreate({
            loanName: account.name,
            loanAccountId: account.id,
            createLoanAccount: false,
          })
        }
      >
        Create Loan Account
      </PermissionButton>
    </div>
  );

  const detailView = (
    <>
      {activeView === "accounts" && selectedAccount ? (
        linkedLoan ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <LoanWorkspaceDetails loanId={linkedLoan.id} onReloadList={onReloadList} />
          </div>
        ) : (
          emptyLoanSetup(selectedAccount)
        )
      ) : null}
      {activeView === "groups" && selectedGroup ? (
        groupMemberFilterId && detailAccount ? (
          groupMemberLoan ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <LoanWorkspaceDetails loanId={groupMemberLoan.id} onReloadList={onReloadList} />
            </div>
          ) : (
            emptyLoanSetup(detailAccount)
          )
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">{selectedGroup.name}</h2>
              <p className="text-xs text-muted-foreground">
                {accountsForSelectedGroup.length} account{accountsForSelectedGroup.length === 1 ? "" : "s"}
              </p>
            </div>
            <LoanAccountList
              accounts={accountsForSelectedGroup}
              selectedAccount={null}
              onSelectAccount={(account) => {
                handleSelectAccount(account);
              }}
              searchTerm=""
              hideQuickFilterBar
            />
          </div>
        )
      ) : null}
      {!selected && (
        <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>
      )}
    </>
  );

  const loanOverviewTitleEl = <LoanStaffNavTitle active="loans" />;

  return (
    <>
      <ResponsiveMasterDetail
        title={loanOverviewTitleEl}
        balance={formatCurrencyForPrint(totalBalance, { showDrCr: true })}
        tabs={isMobile ? undefined : loanTabsEl}
        mobileTabsDocked={isMobile}
        listView={listView}
        detailView={detailView}
        isMobile={isMobile}
        mobileListOnly
        hasSelectedItem={!!selected}
        onBackToList={() => {
          setGroupMemberFilterId(null);
          onSelectAccountId(null, activeView);
        }}
        mobileSelectionLabel={
          activeView === "groups"
            ? selectedGroup?.name
            : selectedAccount?.name
        }
        mobileSelectionLabelClassName={
          selected
            ? masterDetailBalanceToneClass((selected as Staff | StaffGroup).balance)
            : undefined
        }
      />
      <ConvertExistingBankAccountDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        accounts={bankAccountsForConvert}
        onConverted={(link) => {
          onCreate({
            loanName: link.loanName,
            lenderName: link.lenderName,
            lenderType: "Bank",
            bankAccountId: link.bankAccountId,
            loanAccountId: link.loanAccountId,
            createLoanAccount: false,
            convertedFromBankAccountId: link.bankAccountId,
          });
        }}
      />
    </>
  );
}
