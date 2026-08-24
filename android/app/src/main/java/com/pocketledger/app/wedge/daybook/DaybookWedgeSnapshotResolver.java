package com.pocketledger.app.wedge.daybook;

import android.content.Context;
import com.pocketledger.app.wedge.shared.WedgeSnapshotStore;
import com.pocketledger.app.wedge.shared.WedgeWidgetPrefs;
import org.json.JSONArray;
import org.json.JSONObject;

/** Resolve multi-day snapshot + widget-selected date. */
final class DaybookWedgeSnapshotResolver {
    private DaybookWedgeSnapshotResolver() {}

    static JSONObject readRoot(Context context) {
        try {
            String raw = WedgeSnapshotStore.readDaybook(context);
            if (raw == null || raw.isEmpty()) return null;
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject resolveDayBucket(Context context, int appWidgetId, JSONObject root) {
        if (root == null) return null;
        String fallback = root.optString("defaultDayIso", root.optString("selectedDayIso", ""));
        String selected = WedgeWidgetPrefs.getGlobalDayIso(context, fallback);
        JSONArray days = root.optJSONArray("days");
        if (days != null) {
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.optJSONObject(i);
                if (d != null && selected.equals(d.optString("dayIso", ""))) return d;
            }
            if (days.length() > 0) return days.optJSONObject(0);
        }
        return root;
    }

    /** Active company from app snapshot only (not widget-local override). */
    static String activeCompanyId(JSONObject root) {
        if (root == null) return "";
        return root.optString("companyId", "");
    }

    static String activeCompanyName(JSONObject root) {
        if (root == null) return "Pocket Ledger";
        return resolveCompanyName(root, activeCompanyId(root));
    }

    static String shiftDayIso(JSONObject root, String currentIso, int delta) {
        if (root == null || currentIso == null || currentIso.isEmpty()) return null;
        JSONArray days = root.optJSONArray("days");
        if (days == null || days.length() < 2) return null;
        int idx = -1;
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d != null && currentIso.equals(d.optString("dayIso", ""))) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return null;
        int next = idx + delta;
        if (next < 0 || next >= days.length()) return null;
        JSONObject bucket = days.optJSONObject(next);
        return bucket != null ? bucket.optString("dayIso", null) : null;
    }

    static String fixedDateSystem(JSONObject root) {
        if (root != null && root.optBoolean("isNepalCalendar", false)) return "BS";
        return "AD";
    }

    static String dayLabelForSystem(JSONObject bucket, String dateSystem) {
        if (bucket == null) return "";
        if ("AD".equals(dateSystem)) {
            String ad = bucket.optString("dayLabelAd", "");
            if (!ad.isEmpty()) return ad;
        } else if ("BS".equals(dateSystem)) {
            String bs = bucket.optString("dayLabelBs", "");
            if (!bs.isEmpty()) return bs;
        }
        return bucket.optString("dayLabel", "");
    }

    static String metaLineForSystem(JSONObject row, String dateSystem) {
        if (row == null) return "";
        if ("AD".equals(dateSystem)) {
            String ad = row.optString("metaLineAd", "");
            if (!ad.isEmpty()) return ad;
        } else if ("BS".equals(dateSystem)) {
            String bs = row.optString("metaLineBs", "");
            if (!bs.isEmpty()) return bs;
        }
        return row.optString("metaLine", "");
    }

    static String resolveCompanyName(JSONObject root, String companyId) {
        if (root == null || companyId == null || companyId.isEmpty()) return "Pocket Ledger";
        JSONArray companies = root.optJSONArray("companies");
        if (companies != null) {
            for (int i = 0; i < companies.length(); i++) {
                JSONObject c = companies.optJSONObject(i);
                if (c != null && companyId.equals(c.optString("id", ""))) {
                    return c.optString("name", "Company");
                }
            }
        }
        if (companyId.equals(root.optString("companyId", ""))) {
            return root.optString("companyName", "Pocket Ledger");
        }
        return root.optString("companyName", "Pocket Ledger");
    }

    static String cycleDateSystem(String current) {
        if ("AD".equals(current)) return "BS";
        if ("BS".equals(current)) return "Both";
        return "AD";
    }

    static String cycleCompanyId(JSONObject root, String currentId) {
        if (root == null) return currentId;
        JSONArray companies = root.optJSONArray("companies");
        if (companies == null || companies.length() == 0) return root.optString("companyId", currentId);
        int idx = -1;
        for (int i = 0; i < companies.length(); i++) {
            JSONObject c = companies.optJSONObject(i);
            if (c != null && currentId.equals(c.optString("id", ""))) {
                idx = i;
                break;
            }
        }
        int next = idx < 0 ? 0 : (idx + 1) % companies.length();
        JSONObject c = companies.optJSONObject(next);
        return c != null ? c.optString("id", currentId) : currentId;
    }
}
