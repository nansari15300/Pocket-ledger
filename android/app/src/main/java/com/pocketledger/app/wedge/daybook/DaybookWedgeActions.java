package com.pocketledger.app.wedge.daybook;

/** Shared broadcast actions for daybook home-screen wedges. */
public final class DaybookWedgeActions {
    public static final String ACTION_OPEN_DAYBOOK = "com.pocketledger.app.WEDGE_OPEN_DAYBOOK";
    public static final String ACTION_ROW_CLICK = "com.pocketledger.app.WEDGE_DAYBOOK_ROW";
    public static final String ACTION_SUMMARY_ROW = "com.pocketledger.app.WEDGE_SUMMARY_ROW";
    public static final String ACTION_PREV_DAY = "com.pocketledger.app.WEDGE_DAYBOOK_PREV";
    public static final String ACTION_NEXT_DAY = "com.pocketledger.app.WEDGE_DAYBOOK_NEXT";
    public static final String ACTION_TODAY_DAY = "com.pocketledger.app.WEDGE_DAYBOOK_TODAY";
    public static final String ACTION_EXPAND_ROTATE = "com.pocketledger.app.WEDGE_EXPAND_ROTATE";

    public static final String EXTRA_VOUCHER_ID = "wedge_voucher_id";
    public static final String EXTRA_APP_WIDGET_ID = "wedge_app_widget_id";
    public static final String EXTRA_SUMMARY_TOGGLE = "wedge_summary_toggle";

    private DaybookWedgeActions() {}
}
