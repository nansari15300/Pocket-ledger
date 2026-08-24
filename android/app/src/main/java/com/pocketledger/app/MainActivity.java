package com.pocketledger.app;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String UPGRADE_PREFS = "pl_apk_upgrade_cache";
    private static final String BUILD_MARKER_KEY = "build_marker";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupSafPlugin.class);
        registerPlugin(com.pocketledger.app.wedge.shared.WedgePlugin.class);
        clearWebViewCachesAfterApkUpdate();
        super.onCreate(savedInstanceState);
        // Samsung / Android 13+ WebView: algorithmic force-dark gradients aur border tones browser se alag dikha sakta — explict OFF (styles.xml se saath).
        disableWebViewAlgorithmicDarkening();
        clearCurrentWebViewHttpCacheAfterApkUpdate();
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
    /** APK update: purana bundled JS/CSS/WebView HTTP cache hatao; SQLite/IndexedDB/localStorage safe rakho. */
    private void clearWebViewCachesAfterApkUpdate() {
        try {
            String marker = currentApkBuildMarker();
            SharedPreferences prefs = getSharedPreferences(UPGRADE_PREFS, MODE_PRIVATE);
            String previous = prefs.getString(BUILD_MARKER_KEY, "");
            if (marker.equals(previous)) return;

            deleteDirContents(getCacheDir());
            deleteDirContents(new File(getDataDir(), "cache"));
            deleteDirContents(new File(getDataDir(), "code_cache"));
            deleteDirContents(new File(getDataDir(), "app_webview/Default/HTTP Cache"));
            deleteDirContents(new File(getDataDir(), "app_webview/Default/Code Cache"));
            deleteDirContents(new File(getDataDir(), "app_webview/Default/GPUCache"));
            deleteDirContents(new File(getDataDir(), "app_webview/Default/Service Worker/CacheStorage"));
            deleteDirContents(new File(getDataDir(), "app_webview/Default/Service Worker/ScriptCache"));

            prefs.edit().putString(BUILD_MARKER_KEY, marker).apply();
        } catch (Throwable ignored) {
            /* Cache refresh best-effort; app boot must continue. */
        }
    }

    private void clearCurrentWebViewHttpCacheAfterApkUpdate() {
        try {
            Bridge b = getBridge();
            if (b == null) return;
            WebView wv = b.getWebView();
            if (wv == null) return;
            wv.clearCache(true);
        } catch (Throwable ignored) {
            /* Bridge/WebView init race - ignore */
        }
    }

    private String currentApkBuildMarker() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName + ":" + info.versionCode + ":" + info.lastUpdateTime;
        } catch (Throwable ignored) {
            return "unknown";
        }
    }

    private void deleteDirContents(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            deleteRecursively(f);
        }
    }

    private void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        try {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        } catch (Throwable ignored) {
            /* best-effort */
        }
    }
}
