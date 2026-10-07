package com.pocketledger.app;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Exposes Android's stable smallest-width resource qualifier to the web header. */
@CapacitorPlugin(name = "FormFactor")
public class FormFactorPlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        Configuration configuration = getContext().getResources().getConfiguration();
        JSObject result = new JSObject();
        result.put("smallestScreenWidthDp", configuration.smallestScreenWidthDp);
        call.resolve(result);
    }
}
