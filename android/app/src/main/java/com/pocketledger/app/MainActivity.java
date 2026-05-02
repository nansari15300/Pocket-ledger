package com.pocketledger.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupSafPlugin.class);
        super.onCreate(savedInstanceState);
        // Samsung / Android 13+ WebView: algorithmic force-dark gradients aur border tones browser se alag dikha sakta — explict OFF (styles.xml se saath).
        disableWebViewAlgorithmicDarkening();
    }

    /** Chromium WebView FORCE_DARK_OFF — `color-scheme` CSS ke alava native layer bhi light palette pakki karo (S25 APK vs Chrome). */
    private void disableWebViewAlgorithmicDarkening() {
        try {
            Bridge b = getBridge();
            if (b == null) return;
            WebView wv = b.getWebView();
            if (wv == null) return;
            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(wv.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
            }
        } catch (Throwable ignored) {
            /* Bridge/WebView init race — ignore */
        }
    }
}
