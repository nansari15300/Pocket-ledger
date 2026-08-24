package com.pocketledger.app.wedge.daybook;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import com.pocketledger.app.R;
import com.pocketledger.app.wedge.shared.WedgeWidgetPrefs;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Home-screen Daybook daily summary wedge. */
public class DaybookSummaryWedgeProvider extends AppWidgetProvider {
    private static final long INITIAL_FULL_BIND_DELAY_MS = 300L;
    private static final long INITIAL_ADAPTER_DELAY_MS = 200L;

    private static final Set<Integer> ADAPTER_READY =
        Collections.synchronizedSet(new HashSet<Integer>());

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            ADAPTER_READY.remove(appWidgetId);
            WedgeWidgetPrefs.clearWidgetState(context, appWidgetId);
        }
        super.onDeleted(context, appWidgetIds);
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId,
        android.os.Bundle newOptions
    ) {
        if (ADAPTER_READY.contains(appWidgetId)) {
            refreshWidgetData(context, appWidgetManager, appWidgetId);
        } else {
            scheduleInitialBind(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            if (ADAPTER_READY.contains(appWidgetId)) {
                refreshWidgetData(context, appWidgetManager, appWidgetId);
            } else {
                scheduleInitialBind(context, appWidgetManager, appWidgetId);
            }
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (DaybookWedgeBroadcasts.dispatch(context, intent)) return;
        super.onReceive(context, intent);
    }

    private static void scheduleInitialBind(Context context, AppWidgetManager mgr, int appWidgetId) {
        try {
            RemoteViews stub = new RemoteViews(context.getPackageName(), R.layout.wedge_widget_stub);
            mgr.updateAppWidget(appWidgetId, stub);
        } catch (Exception e) {
            android.util.Log.e("DaybookWedge", "stub bind failed", e);
        }

        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(() -> bindFullWidget(context, mgr, appWidgetId, true), INITIAL_FULL_BIND_DELAY_MS);
    }

    private static void bindFullWidget(
        Context context,
        AppWidgetManager mgr,
        int appWidgetId,
        boolean attachAdapterAfter
    ) {
        try {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.wedge_summary_widget);
            DaybookWedgeBinder.bind(context, views, appWidgetId, DaybookSummaryWedgeProvider.class, true);
            mgr.updateAppWidget(appWidgetId, views);
            if (attachAdapterAfter) {
                new Handler(Looper.getMainLooper()).postDelayed(
                    () -> attachSummaryAdapter(context, mgr, appWidgetId),
                    INITIAL_ADAPTER_DELAY_MS
                );
            }
        } catch (Exception e) {
            android.util.Log.e("DaybookWedge", "bindWidget failed", e);
            ADAPTER_READY.remove(appWidgetId);
        }
    }

    static void bindWidget(Context context, AppWidgetManager mgr, int appWidgetId) {
        if (ADAPTER_READY.contains(appWidgetId)) {
            refreshWidgetData(context, mgr, appWidgetId);
        } else {
            scheduleInitialBind(context, mgr, appWidgetId);
        }
    }

    public static void refreshWidgetData(Context context, AppWidgetManager mgr, int appWidgetId) {
        try {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.wedge_summary_widget);
            DaybookWedgeBinder.bind(context, views, appWidgetId, DaybookSummaryWedgeProvider.class, true);
            if (ADAPTER_READY.contains(appWidgetId)) {
                Intent serviceIntent = new Intent(context, DaybookWedgeService.class);
                serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
                serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
                views.setRemoteAdapter(R.id.wedge_summary_list, serviceIntent);
                views.setEmptyView(R.id.wedge_summary_list, R.id.wedge_summary_empty);
                mgr.updateAppWidget(appWidgetId, views);
                mgr.notifyAppWidgetViewDataChanged(appWidgetId, R.id.wedge_summary_list);
            } else {
                bindFullWidget(context, mgr, appWidgetId, true);
            }
        } catch (Exception e) {
            android.util.Log.w("DaybookWedge", "refreshWidgetData failed", e);
        }
    }

    private static void attachSummaryAdapter(Context context, AppWidgetManager mgr, int appWidgetId) {
        try {
            RemoteViews adapterViews = new RemoteViews(context.getPackageName(), R.layout.wedge_summary_widget);
            Intent serviceIntent = new Intent(context, DaybookWedgeService.class);
            serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
            adapterViews.setRemoteAdapter(R.id.wedge_summary_list, serviceIntent);
            adapterViews.setEmptyView(R.id.wedge_summary_list, R.id.wedge_summary_empty);
            DaybookWedgeBinder.bind(context, adapterViews, appWidgetId, DaybookSummaryWedgeProvider.class, true);
            mgr.updateAppWidget(appWidgetId, adapterViews);
            mgr.notifyAppWidgetViewDataChanged(appWidgetId, R.id.wedge_summary_list);
            ADAPTER_READY.add(appWidgetId);
        } catch (Exception e) {
            android.util.Log.w("DaybookWedge", "summary adapter unavailable", e);
            ADAPTER_READY.remove(appWidgetId);
        }
    }
}
