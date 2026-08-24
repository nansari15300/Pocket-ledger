package com.pocketledger.app.wedge.daybook;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import com.pocketledger.app.R;

/** Binds daybook summary RemoteViews (home-screen widget only). */
final class DaybookWedgeBinder {
    private DaybookWedgeBinder() {}

    static void bind(
        Context context,
        RemoteViews views,
        int appWidgetId,
        Class<?> providerClass,
        boolean showRotate
    ) {
        org.json.JSONObject root = DaybookWedgeSnapshotResolver.readRoot(context);
        org.json.JSONObject bucket = DaybookWedgeSnapshotResolver.resolveDayBucket(context, appWidgetId, root);

        DaybookWedgeBindUtil.bindToolbar(context, views, root);
        DaybookWedgeBindUtil.bindDateNav(context, views, root, bucket, providerClass, appWidgetId);

        if (showRotate) {
            views.setViewVisibility(R.id.wedge_daybook_rotate, android.view.View.VISIBLE);
            views.setTextViewText(R.id.wedge_daybook_rotate, "\u21BB");
            views.setTextColor(R.id.wedge_daybook_rotate, 0xFF1E3A8A);
            Intent expand = new Intent(context, DaybookWedgeExpandActivity.class);
            expand.putExtra(DaybookWedgeActions.EXTRA_APP_WIDGET_ID, appWidgetId);
            expand.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_MULTIPLE_TASK
                    | Intent.FLAG_ACTIVITY_NO_HISTORY
                    | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            );
            views.setOnClickPendingIntent(
                R.id.wedge_daybook_rotate,
                PendingIntent.getActivity(
                    context,
                    appWidgetId * 10 + 30,
                    expand,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                )
            );
        } else {
            views.setViewVisibility(R.id.wedge_daybook_rotate, android.view.View.GONE);
        }

        views.setEmptyView(R.id.wedge_summary_list, R.id.wedge_summary_empty);
    }
}
