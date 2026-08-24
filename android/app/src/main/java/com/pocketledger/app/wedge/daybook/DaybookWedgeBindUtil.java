package com.pocketledger.app.wedge.daybook;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import com.pocketledger.app.R;
import com.pocketledger.app.wedge.shared.WedgeWidgetPrefs;
import org.json.JSONObject;

/** Toolbar + day navigation for bank/cash summary wedge. */
final class DaybookWedgeBindUtil {
    private DaybookWedgeBindUtil() {}

    static void bindToolbar(Context context, RemoteViews views, JSONObject root) {
        views.setTextViewText(R.id.wedge_daybook_company, DaybookWedgeSnapshotResolver.activeCompanyName(root));
    }

    static void bindDateNav(
        Context context,
        RemoteViews views,
        JSONObject root,
        JSONObject bucket,
        Class<?> providerClass,
        int appWidgetId
    ) {
        String dateSystem = DaybookWedgeSnapshotResolver.fixedDateSystem(root);
        String dayLabel = DaybookWedgeSnapshotResolver.dayLabelForSystem(bucket, dateSystem);
        if (dayLabel.isEmpty() && bucket != null) dayLabel = bucket.optString("dayLabel", "");
        views.setTextViewText(R.id.wedge_daybook_day, dayLabel);

        views.setOnClickPendingIntent(
            R.id.wedge_daybook_prev,
            widgetBroadcast(context, providerClass, appWidgetId, DaybookWedgeActions.ACTION_PREV_DAY, 2)
        );
        views.setOnClickPendingIntent(
            R.id.wedge_daybook_next,
            widgetBroadcast(context, providerClass, appWidgetId, DaybookWedgeActions.ACTION_NEXT_DAY, 3)
        );
        views.setOnClickPendingIntent(
            R.id.wedge_daybook_today,
            widgetBroadcast(context, providerClass, appWidgetId, DaybookWedgeActions.ACTION_TODAY_DAY, 13)
        );
    }

    static boolean handleDayAction(Context context, String action) {
        JSONObject root = DaybookWedgeSnapshotResolver.readRoot(context);
        String fallback = root != null ? root.optString("defaultDayIso", "") : "";
        String current = WedgeWidgetPrefs.getGlobalDayIso(context, fallback);

        if (DaybookWedgeActions.ACTION_TODAY_DAY.equals(action)) {
            String today = root != null ? root.optString("defaultDayIso", "") : "";
            if (today.isEmpty()) return false;
            WedgeWidgetPrefs.setGlobalDayIso(context, today);
            return true;
        }

        int delta = DaybookWedgeActions.ACTION_PREV_DAY.equals(action) ? 1 : -1;
        String next = DaybookWedgeSnapshotResolver.shiftDayIso(root, current, delta);
        if (next == null) return false;
        WedgeWidgetPrefs.setGlobalDayIso(context, next);
        return true;
    }

    static PendingIntent widgetBroadcast(
        Context context,
        Class<?> providerClass,
        int appWidgetId,
        String action,
        int slot
    ) {
        Intent intent = new Intent(context, providerClass);
        intent.setAction(action);
        intent.putExtra(DaybookWedgeActions.EXTRA_APP_WIDGET_ID, appWidgetId);
        return PendingIntent.getBroadcast(
            context,
            appWidgetId * 10 + slot,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
