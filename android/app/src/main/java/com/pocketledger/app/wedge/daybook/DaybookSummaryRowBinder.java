package com.pocketledger.app.wedge.daybook;



import android.graphics.Typeface;

import android.view.View;

import android.widget.RemoteViews;

import android.widget.TextView;

import com.pocketledger.app.R;



final class DaybookSummaryRowBinder {

    private DaybookSummaryRowBinder() {}



    static void bindRemote(RemoteViews row, DaybookSummaryLines.SummaryLine line) {

        applyRowBackgroundRemote(row, line.kind);

        if (line.kind == DaybookSummaryLines.KIND_COLS) {

            row.setTextViewText(R.id.wedge_summary_row_name, "Account");

            row.setTextViewText(R.id.wedge_summary_row_open, "Opening");

            row.setTextColor(R.id.wedge_summary_row_open, 0xFF1E3A8A);

            row.setTextViewText(R.id.wedge_summary_row_in, "Today In");

            row.setTextColor(R.id.wedge_summary_row_in, 0xFF16A34A);

            row.setTextViewText(R.id.wedge_summary_row_out, "Today Out");

            row.setTextColor(R.id.wedge_summary_row_out, 0xFFDC2626);

            row.setTextViewText(R.id.wedge_summary_row_bal, "Today Bal");

            row.setTextColor(R.id.wedge_summary_row_bal, 0xFF1E3A8A);
            return;
        }
        String name = formatName(line);
        row.setTextViewText(R.id.wedge_summary_row_name, name);
        bindMoneyRemote(row, line);
        int nameColor = line.kind == DaybookSummaryLines.KIND_ACCOUNT ? 0xFF64748B : 0xFF0F172A;
        row.setTextColor(R.id.wedge_summary_row_name, nameColor);
    }



    static void bindView(View row, DaybookSummaryLines.SummaryLine line) {

        applyRowBackgroundView(row, line.kind);

        TextView name = row.findViewById(R.id.wedge_summary_row_name);

        TextView open = row.findViewById(R.id.wedge_summary_row_open);

        TextView inn = row.findViewById(R.id.wedge_summary_row_in);

        TextView out = row.findViewById(R.id.wedge_summary_row_out);

        TextView bal = row.findViewById(R.id.wedge_summary_row_bal);

        if (line.kind == DaybookSummaryLines.KIND_COLS) {

            name.setText("Account");

            name.setTextColor(0xFF1E3A8A);

            open.setText("Opening");

            open.setTextColor(0xFF1E3A8A);

            inn.setText("Today In");

            inn.setTextColor(0xFF16A34A);

            out.setText("Today Out");

            out.setTextColor(0xFFDC2626);

            bal.setText("Today Bal");

            bal.setTextColor(0xFF1E3A8A);

            setBoldView(name, open, inn, out, bal, true);

            return;

        }

        name.setText(formatName(line));

        name.setTextColor(line.kind == DaybookSummaryLines.KIND_ACCOUNT ? 0xFF64748B : 0xFF0F172A);

        bindMoneyView(open, inn, out, bal, line);

        boolean bold = line.kind == DaybookSummaryLines.KIND_GROUP || line.kind == DaybookSummaryLines.KIND_TOTAL;

        setBoldView(name, open, inn, out, bal, bold);

    }



    private static String formatName(DaybookSummaryLines.SummaryLine line) {

        if (line.kind == DaybookSummaryLines.KIND_GROUP) {

            return "\u25BE " + line.name;

        }

        if (line.kind == DaybookSummaryLines.KIND_ACCOUNT) {

            return "    " + line.name;

        }

        return line.name;

    }



    private static void applyRowBackgroundRemote(RemoteViews row, int kind) {

        int bg =

            kind == DaybookSummaryLines.KIND_COLS

                ? R.drawable.wedge_summary_row_header_bg

                : R.drawable.wedge_summary_row_line_1dp;

        row.setInt(R.id.wedge_summary_row_root, "setBackgroundResource", bg);

    }



    private static void applyRowBackgroundView(View row, int kind) {

        row.setBackgroundResource(

            kind == DaybookSummaryLines.KIND_COLS

                ? R.drawable.wedge_summary_row_header_bg

                : R.drawable.wedge_summary_row_line_1dp

        );

    }



    private static void setBoldView(TextView name, TextView open, TextView inn, TextView out, TextView bal, boolean bold) {

        int style = bold ? Typeface.BOLD : Typeface.NORMAL;

        name.setTypeface(name.getTypeface(), style);

        open.setTypeface(open.getTypeface(), style);

        inn.setTypeface(inn.getTypeface(), style);

        out.setTypeface(out.getTypeface(), style);

        bal.setTypeface(bal.getTypeface(), style);

    }



    private static void bindMoneyRemote(RemoteViews row, DaybookSummaryLines.SummaryLine line) {

        row.setTextViewText(R.id.wedge_summary_row_open, DaybookSummaryLines.formatMoney(line.open));

        row.setTextColor(R.id.wedge_summary_row_open, line.open >= 0 ? 0xFF16A34A : 0xFFDC2626);

        row.setTextViewText(R.id.wedge_summary_row_in, DaybookSummaryLines.formatMoney(line.inn));

        row.setTextViewText(R.id.wedge_summary_row_out, DaybookSummaryLines.formatMoney(line.out));

        row.setTextViewText(R.id.wedge_summary_row_bal, DaybookSummaryLines.formatMoney(line.bal));

        row.setTextColor(R.id.wedge_summary_row_bal, line.bal >= 0 ? 0xFF16A34A : 0xFFDC2626);

    }



    private static void bindMoneyView(TextView open, TextView inn, TextView out, TextView bal, DaybookSummaryLines.SummaryLine line) {

        open.setText(DaybookSummaryLines.formatMoney(line.open));

        open.setTextColor(line.open >= 0 ? 0xFF16A34A : 0xFFDC2626);

        inn.setText(DaybookSummaryLines.formatMoney(line.inn));

        out.setText(DaybookSummaryLines.formatMoney(line.out));

        bal.setText(DaybookSummaryLines.formatMoney(line.bal));

        bal.setTextColor(line.bal >= 0 ? 0xFF16A34A : 0xFFDC2626);

    }

}

