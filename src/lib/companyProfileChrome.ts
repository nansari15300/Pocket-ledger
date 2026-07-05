/** Company Profile — dashboard jaisa zone colors + form field chrome */
export const companyProfileChromeRoot = "data-pl-company-profile-chrome";

/** Poora Company Profile card — gray page background */
export const companyProfilePageBg = "bg-muted/55";

/** Cloud repair / upload-to-cloud top box — dashboard pink tone */
export const companyProfilePinkZone = "pl-chrome-tone-pink border border-black rounded-lg";

/** Form + tabs content — dashboard green (emerald) tone */
export const companyProfileGreenZone = "pl-chrome-tone-emerald border border-black rounded-lg";

/** Edit/Add row — pill ke upar/neeche barabar gap; selected tab blue */
export const companyProfileTabsList =
  "grid h-auto min-h-11 w-full grid-cols-2 gap-1 rounded-md border border-black bg-muted/80 p-1 items-stretch";
/** Manage Sharing local guide — 3 language tabs */
export const companyProfileTabsList3 =
  "grid h-auto min-h-11 w-full max-w-md grid-cols-3 gap-1 rounded-md border border-black bg-muted/80 p-1 items-stretch";
export const companyProfileTabsTrigger =
  "flex h-full min-h-9 items-center justify-center rounded-full border-0 py-0 shadow-none text-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-foreground data-[state=active]:border data-[state=active]:border-black data-[state=active]:bg-blue-500 data-[state=active]:text-white";

/** Company Profile + Manage Sharing outer card shell */
export const settingsDetailCardShell = `border border-black ${companyProfilePageBg}`;

/** Cloud sync — dashboard stat cards jaisa emerald shell */
export const cloudSyncPageCard = "pl-chrome-card pl-chrome-tone-emerald border border-black";
export const cloudSyncPanelBase = `${cloudSyncPageCard} rounded-md p-3`;
export const cloudSyncEncryptCard = `${cloudSyncPanelBase} space-y-3`;
export const cloudSyncFirebaseReconcileCard = `${cloudSyncPanelBase} space-y-2`;
/** Join / restore panel — shrink wrap; h-full mat do (poora page kha jata hai) */
export const cloudSyncJoinPanelCard = `${cloudSyncPanelBase} space-y-4`;
/** Share company on Drive — right column poori height */
export const cloudSyncSharePanelCard = `${cloudSyncPanelBase} space-y-3 h-full flex flex-col min-h-0`;
/** Share table — andar bhi dashboard emerald, white box nahi */
export const cloudSyncShareTableShell =
  "pl-chrome-card pl-chrome-tone-emerald rounded-md overflow-x-auto flex-1 min-h-0 border border-emerald-300/55 dark:border-emerald-800/55";
export const cloudSyncShareTableClass =
  "[&_thead_tr]:border-emerald-300/70 [&_th]:bg-emerald-100/80 [&_th]:text-emerald-950 [&_th]:font-semibold dark:[&_th]:bg-emerald-950/50 dark:[&_th]:text-emerald-50 [&_tbody_tr]:border-emerald-200/50 dark:[&_tbody_tr]:border-emerald-900/40 [&_tbody_tr:hover]:bg-emerald-50/70 dark:[&_tbody_tr:hover]:bg-emerald-950/30";
/** Sync status card — last sync, pending, next sync countdown */
export const cloudSyncStatusCard = `${cloudSyncPanelBase} space-y-3`;
/** Sync summary card — added / uploaded files & vouchers */
export const cloudSyncLastSyncSummaryCard = `${cloudSyncPanelBase} space-y-2`;
/** Cloud sync settings outer card + join panel nested card */
export const cloudSyncSettingsPageShell = `${cloudSyncPageCard} rounded-lg`;
export const cloudSyncNestedCard = `${cloudSyncPageCard} rounded-md border-emerald-200/80 bg-white/55 dark:bg-emerald-950/25`;

/** Drive share dialogs — panel jaisa emerald tone */
export const cloudSyncDialogContent = `${cloudSyncNestedCard} sm:max-w-md border-emerald-300/70 dark:border-emerald-800/55`;
export const cloudSyncDialogTitleClass = "text-emerald-950 dark:text-emerald-50";
export const cloudSyncDialogPrimaryButton =
  "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500";
export const cloudSyncDialogOutlineButton =
  "border-emerald-400/80 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50";
