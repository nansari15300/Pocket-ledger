package com.pocketledger.app.wedge.shared;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import com.pocketledger.app.wedge.daybook.DaybookSummaryWedgeProvider;

public final class WedgeUpdateDispatcher {
    private WedgeUpdateDispatcher() {}

    /** Light refresh: update list data + date/company text without stub flash. */
    public static void refreshDaybookWidgetData(Context context) {
        if (context == null) return;
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, DaybookSummaryWedgeProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null) return;
            for (int id : ids) {
                DaybookSummaryWedgeProvider.refreshWidgetData(context, mgr, id);
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    /** Full provider update — only first bind / widget resize recovery. */
    public static void refreshDaybookWidgets(Context context) {
        if (context == null) return;
        refreshProvider(context, DaybookSummaryWedgeProvider.class);
    }

    private static void refreshProvider(Context context, Class<?> providerClass) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, providerClass);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            Intent intent = new Intent(context, providerClass);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(intent);
        } catch (Exception ignored) {
            /* best-effort */
        }
    }
}
