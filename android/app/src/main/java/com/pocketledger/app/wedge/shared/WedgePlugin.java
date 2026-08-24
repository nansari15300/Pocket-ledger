package com.pocketledger.app.wedge.shared;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Wedge")
public class WedgePlugin extends Plugin {

    @PluginMethod
    public void pushDaybookSnapshot(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.trim().isEmpty()) {
            call.reject("Missing payload");
            return;
        }
        WedgeSnapshotStore.saveDaybook(getContext(), payload);
        try {
            org.json.JSONObject root = new org.json.JSONObject(payload);
            boolean isNepal = root.optBoolean("isNepalCalendar", false);
            String defaultIso = root.optString("defaultDayIso", "");
            if (isNepal) {
                WedgeWidgetPrefs.setGlobalDateSystem(getContext(), "BS");
            } else {
                WedgeWidgetPrefs.setGlobalDateSystem(getContext(), "AD");
            }
            String selected = WedgeWidgetPrefs.getGlobalDayIso(getContext(), defaultIso);
            org.json.JSONArray days = root.optJSONArray("days");
            if (days != null && selected != null && !selected.isEmpty()) {
                boolean found = false;
                for (int i = 0; i < days.length(); i++) {
                    org.json.JSONObject d = days.optJSONObject(i);
                    if (d != null && selected.equals(d.optString("dayIso", ""))) {
                        found = true;
                        break;
                    }
                }
                if (!found && defaultIso != null && !defaultIso.isEmpty()) {
                    WedgeWidgetPrefs.setGlobalDayIso(getContext(), defaultIso);
                }
            }
        } catch (Exception ignored) {
            /* best-effort prefs sync */
        }
        WedgeUpdateDispatcher.refreshDaybookWidgetData(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestDaybookWidgetRefresh(PluginCall call) {
        WedgeUpdateDispatcher.refreshDaybookWidgetData(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
