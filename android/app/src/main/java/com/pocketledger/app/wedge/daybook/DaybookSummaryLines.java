package com.pocketledger.app.wedge.daybook;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Builds flat summary rows for widget list + fullscreen expand. */
final class DaybookSummaryLines {
    static final int KIND_COLS = -1;
    static final int KIND_GROUP = 0;
    static final int KIND_ACCOUNT = 1;
    static final int KIND_TOTAL = 2;

    private DaybookSummaryLines() {}

    static List<SummaryLine> build(Context context, int appWidgetId) {
        List<SummaryLine> lines = new ArrayList<>();
        JSONObject s = new JSONObject();
        try {
            JSONObject root = DaybookWedgeSnapshotResolver.readRoot(context);
            JSONObject bucket = DaybookWedgeSnapshotResolver.resolveDayBucket(context, appWidgetId, root);
            if (bucket != null) {
                JSONObject summary = bucket.optJSONObject("summary");
                if (summary != null) s = summary;
            }
        } catch (Exception ignored) {
            /* use empty summary */
        }

        lines.add(new SummaryLine(KIND_COLS, "Account", 0, 0, 0, 0));
        lines.add(
            groupLine(
                "Bank",
                s.optDouble("bankYesterday", 0),
                s.optDouble("bankIn", 0),
                s.optDouble("bankOut", 0),
                s.optDouble("bankToday", 0)
            )
        );
        appendAccounts(lines, s.optJSONArray("bankAccounts"), KIND_ACCOUNT);
        lines.add(
            groupLine(
                "Cash",
                s.optDouble("cashYesterday", 0),
                s.optDouble("cashIn", 0),
                s.optDouble("cashOut", 0),
                s.optDouble("cashToday", 0)
            )
        );
        appendAccounts(lines, s.optJSONArray("cashAccounts"), KIND_ACCOUNT);
        lines.add(
            new SummaryLine(
                KIND_TOTAL,
                "Total",
                s.optDouble("totalYesterday", 0),
                s.optDouble("totalIn", 0),
                s.optDouble("totalOut", 0),
                s.optDouble("totalToday", 0)
            )
        );
        return lines;
    }

    private static void appendAccounts(List<SummaryLine> out, JSONArray arr, int kind) {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject a = arr.optJSONObject(i);
            if (a == null) continue;
            out.add(
                new SummaryLine(
                    kind,
                    a.optString("name", "Account"),
                    a.optDouble("yesterday", 0),
                    a.optDouble("in", 0),
                    a.optDouble("out", 0),
                    a.optDouble("today", 0)
                )
            );
        }
    }

    private static SummaryLine groupLine(String label, double open, double inn, double out, double bal) {
        return new SummaryLine(KIND_GROUP, label, open, inn, out, bal);
    }

    static String formatMoney(double n) {
        java.text.NumberFormat nf = java.text.NumberFormat.getNumberInstance(new Locale("en", "IN"));
        nf.setMaximumFractionDigits(0);
        nf.setMinimumFractionDigits(0);
        return nf.format(Math.round(n));
    }

    static final class SummaryLine {
        final int kind;
        final String name;
        final double open;
        final double inn;
        final double out;
        final double bal;

        SummaryLine(int kind, String name, double open, double inn, double out, double bal) {
            this.kind = kind;
            this.name = name;
            this.open = open;
            this.inn = inn;
            this.out = out;
            this.bal = bal;
        }
    }
}
