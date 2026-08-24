package com.pocketledger.app.wedge.daybook;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;
import com.pocketledger.app.R;
import com.pocketledger.app.wedge.shared.WedgeUpdateDispatcher;
import java.util.List;
import org.json.JSONObject;

/**
 * Landscape fullscreen summary when widget ↻ is tapped.
 * Native only — separate process; does not open Pocket Ledger dashboard.
 */
public class DaybookWedgeExpandActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        setContentView(R.layout.wedge_summary_expand);

        appWidgetId = getIntent().getIntExtra(DaybookWedgeActions.EXTRA_APP_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            appWidgetId = 0;
        }
        bindChrome();
    }

    @Override
    public void onBackPressed() {
        finish();
    }

    private void bindChrome() {
        JSONObject root = DaybookWedgeSnapshotResolver.readRoot(this);
        JSONObject bucket = DaybookWedgeSnapshotResolver.resolveDayBucket(this, appWidgetId, root);

        TextView company = findViewById(R.id.wedge_daybook_company);
        company.setText(DaybookWedgeSnapshotResolver.activeCompanyName(root));

        View close = findViewById(R.id.wedge_daybook_rotate);
        close.setOnClickListener(v -> finish());

        String dateSystem = DaybookWedgeSnapshotResolver.fixedDateSystem(root);
        String dayLabel = DaybookWedgeSnapshotResolver.dayLabelForSystem(bucket, dateSystem);
        if (dayLabel.isEmpty() && bucket != null) dayLabel = bucket.optString("dayLabel", "");
        TextView day = findViewById(R.id.wedge_daybook_day);
        day.setText(dayLabel);

        findViewById(R.id.wedge_daybook_prev).setOnClickListener(v -> shiftDay(DaybookWedgeActions.ACTION_PREV_DAY));
        findViewById(R.id.wedge_daybook_next).setOnClickListener(v -> shiftDay(DaybookWedgeActions.ACTION_NEXT_DAY));
        findViewById(R.id.wedge_daybook_today).setOnClickListener(v -> shiftDay(DaybookWedgeActions.ACTION_TODAY_DAY));

        ListView list = findViewById(R.id.wedge_summary_list);
        List<DaybookSummaryLines.SummaryLine> lines = DaybookSummaryLines.build(this, appWidgetId);
        list.setAdapter(new SummaryAdapter(lines));
        list.setEmptyView(findViewById(R.id.wedge_summary_empty));
    }

    private void shiftDay(String action) {
        if (DaybookWedgeBindUtil.handleDayAction(this, action)) {
            bindChrome();
            WedgeUpdateDispatcher.refreshDaybookWidgetData(this);
        }
    }

    private static final class SummaryAdapter extends BaseAdapter {
        private final List<DaybookSummaryLines.SummaryLine> lines;

        SummaryAdapter(List<DaybookSummaryLines.SummaryLine> lines) {
            this.lines = lines;
        }

        @Override
        public int getCount() {
            return lines.size();
        }

        @Override
        public Object getItem(int position) {
            return lines.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View row =
                convertView != null
                    ? convertView
                    : LayoutInflater.from(parent.getContext())
                        .inflate(R.layout.wedge_summary_list_row_expand, parent, false);
            DaybookSummaryLines.SummaryLine line = lines.get(position);
            DaybookSummaryRowBinder.bindView(row, line);
            if (line.kind == DaybookSummaryLines.KIND_COLS) {
                row.setBackgroundResource(R.drawable.wedge_summary_row_header_bg);
            } else {
                row.setBackgroundResource(R.drawable.wedge_summary_row_line_1dp);
            }
            return row;
        }
    }
}
