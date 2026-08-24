package com.pocketledger.app.wedge.shared;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Shared daybook wedge UI state (day, date system, summary expand). */
public final class WedgeWidgetPrefs {
    private static final String PREFS = "pl_wedge_widget_prefs";
    private static final String KEY_GLOBAL_DAY_ISO = "day_iso_global";
    private static final String KEY_GLOBAL_DATE_SYSTEM = "date_system_global";
    private static final String KEY_BANK_EXPANDED = "bank_expanded_";
    private static final String KEY_CASH_EXPANDED = "cash_expanded_";

    private WedgeWidgetPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String getGlobalDayIso(Context context, String fallbackIso) {
        String v = prefs(context).getString(KEY_GLOBAL_DAY_ISO, "");
        if (v == null || v.isEmpty()) return fallbackIso != null ? fallbackIso : "";
        return v;
    }

    public static void setGlobalDayIso(Context context, String dayIso) {
        if (dayIso == null || dayIso.isEmpty()) return;
        prefs(context).edit().putString(KEY_GLOBAL_DAY_ISO, dayIso).apply();
    }

    public static String getGlobalDateSystem(Context context, String fallback) {
        String v = prefs(context).getString(KEY_GLOBAL_DATE_SYSTEM, "");
        if (v == null || v.isEmpty()) return fallback != null ? fallback : "AD";
        return v;
    }

    public static void setGlobalDateSystem(Context context, String dateSystem) {
        if (dateSystem == null || dateSystem.isEmpty()) return;
        prefs(context).edit().putString(KEY_GLOBAL_DATE_SYSTEM, dateSystem).apply();
    }

    public static boolean getBankExpanded(Context context, int appWidgetId) {
        return prefs(context).getBoolean(KEY_BANK_EXPANDED + appWidgetId, false);
    }

    public static void setBankExpanded(Context context, int appWidgetId, boolean expanded) {
        prefs(context).edit().putBoolean(KEY_BANK_EXPANDED + appWidgetId, expanded).apply();
    }

    public static boolean getCashExpanded(Context context, int appWidgetId) {
        return prefs(context).getBoolean(KEY_CASH_EXPANDED + appWidgetId, false);
    }

    public static void setCashExpanded(Context context, int appWidgetId, boolean expanded) {
        prefs(context).edit().putBoolean(KEY_CASH_EXPANDED + appWidgetId, expanded).apply();
    }

    public static void clearWidgetState(Context context, int appWidgetId) {
        prefs(context)
            .edit()
            .remove(KEY_BANK_EXPANDED + appWidgetId)
            .remove(KEY_CASH_EXPANDED + appWidgetId)
            .apply();
    }

    public static String cycleGlobalDateSystem(Context context, JSONObject root) {
        String snapshotDateSystem = root != null ? root.optString("dateSystem", "Both") : "Both";
        String current = getGlobalDateSystem(context, snapshotDateSystem);
        String next = "AD".equals(current) ? "BS" : "BS".equals(current) ? "Both" : "AD";
        setGlobalDateSystem(context, next);
        return next;
    }
}
