package com.pocketledger.app.wedge.shared;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Native cache: app WebView se JSON snapshot (daybook wedge). */
public final class WedgeSnapshotStore {
    private static final String DIR = "wedge";
    private static final String DAYBOOK_FILE = "daybook_snapshot.json";

    private WedgeSnapshotStore() {}

    public static void saveDaybook(Context context, String json) {
        if (context == null || json == null) return;
        try {
            File dir = new File(context.getFilesDir(), DIR);
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File out = new File(dir, DAYBOOK_FILE);
            try (FileOutputStream fos = new FileOutputStream(out, false)) {
                fos.write(json.getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    public static String readDaybook(Context context) {
        if (context == null) return "";
        try {
            File f = new File(new File(context.getFilesDir(), DIR), DAYBOOK_FILE);
            if (!f.exists()) return "";
            try (FileInputStream fis = new FileInputStream(f);
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = fis.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            return "";
        }
    }
}
