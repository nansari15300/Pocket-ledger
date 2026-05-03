/**
 * Global `Table`/`TableRow` (ui/table.tsx) 3px black dividers — dashboard neutral line (1px via !important).
 * `<Table className={cn(..., DASHBOARD_VIEW_DETAILS_TABLE_CN)}>` se tbody/thead/tfoot override.
 * "View Details" modals: root `dashboard-financial-popup` (globals.css) in lines ~0.4px tak patli karta hai.
 */
export const DASHBOARD_VIEW_DETAILS_TABLE_CN =
  "[&_tbody_tr]:!border-b-[1px] [&_tbody_tr]:!border-border/65 [&_tbody_tr]:!border-black/0 " +
  "[&_thead_tr]:!border-b-[1px] [&_thead_tr]:!border-border/75 [&_thead_tr]:!border-black/0 " +
  "[&_tfoot_tr]:!border-t-[1px] [&_tfoot_tr]:!border-t-border/60 [&_tfoot_tr]:!border-black/0";
