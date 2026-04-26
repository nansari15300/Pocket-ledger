package com.pocketledger.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/**
 * Writes backup bytes into a user-picked Storage Access Framework (SAF) tree URI.
 * Capacitor {@code Filesystem} cannot write to {@code content://.../tree/...} paths; this uses {@link DocumentsContract}.
 */
@CapacitorPlugin(name = "BackupSaf")
public class BackupSafPlugin extends Plugin {

    @PluginMethod
    public void writeToTreeUri(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String fileName = call.getString("fileName");
        String base64 = call.getString("data");
        if (treeUriStr == null || treeUriStr.trim().isEmpty()) {
            call.reject("Missing treeUri");
            return;
        }
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Missing fileName");
            return;
        }
        if (base64 == null) {
            call.reject("Missing data");
            return;
        }

        Uri treeUri = Uri.parse(treeUriStr.trim());
        String safeName = fileName.trim().replaceAll("[\\\\/]+", "_");

        try {
            ContentResolver resolver = getContext().getContentResolver();
            try {
                int flags =
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                resolver.takePersistableUriPermission(treeUri, flags);
            } catch (SecurityException ignored) {
                // Picker intent may not have been persistable; write can still succeed in-session.
            }

            String treeDocId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocId);

            Uri outUri =
                DocumentsContract.createDocument(resolver, parentUri, "application/octet-stream", safeName);
            if (outUri == null) {
                call.reject("Could not create file in the selected folder (createDocument returned null).");
                return;
            }

            byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
            try (OutputStream os = resolver.openOutputStream(outUri)) {
                if (os == null) {
                    call.reject("Could not open output stream for new file.");
                    return;
                }
                os.write(bytes);
                os.flush();
            }

            JSObject ret = new JSObject();
            ret.put("uri", outUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Write failed: " + (e.getMessage() != null ? e.getMessage() : e.toString()), e);
        }
    }
}
