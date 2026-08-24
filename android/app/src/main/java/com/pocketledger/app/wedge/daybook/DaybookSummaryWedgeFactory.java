package com.pocketledger.app.wedge.daybook;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import com.pocketledger.app.R;
import java.util.List;

class DaybookSummaryWedgeFactory implements RemoteViewsService.RemoteViewsFactory {
    private final Context context;
    private final int appWidgetId;
    private List<DaybookSummaryLines.SummaryLine> lines = java.util.Collections.emptyList();

    DaybookSummaryWedgeFactory(Context context, Intent intent) {
        this.context = context.getApplicationContext();
        this.appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
    }

    @Override
    public void onCreate() {}

    @Override
    public void onDataSetChanged() {
        lines = DaybookSummaryLines.build(context, appWidgetId);
    }

    @Override
    public void onDestroy() {
        lines = java.util.Collections.emptyList();
    }

    @Override
    public int getCount() {
        return lines.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.wedge_summary_list_row);
        try {
            DaybookSummaryLines.SummaryLine line = lines.get(position);
            DaybookSummaryRowBinder.bindRemote(row, line);
        } catch (Exception ignored) {
            row.setTextViewText(R.id.wedge_summary_row_name, "—");
        }
        return row;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}
