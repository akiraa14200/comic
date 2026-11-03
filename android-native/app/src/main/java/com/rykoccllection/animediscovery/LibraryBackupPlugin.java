package com.rykoccllection.animediscovery;

import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import com.getcapacitor.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LibraryBackup")
public class LibraryBackupPlugin extends Plugin {
    private static final String PREFS = "rykoc_library_backup";
    private static final String FOLDER_KEY = "tree_uri";
    private static final String BACKUP_NAME = "RykocCllection-Library-Backup.json";

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Folder selection cancelled.");
            return;
        }
        Uri uri = result.getData().getData();
        int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
            getContext().getSharedPreferences(PREFS, 0).edit().putString(FOLDER_KEY, uri.toString()).apply();
            JSObject ret = new JSObject();
            ret.put("folderSelected", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not keep access to this folder. Please choose another folder.", e);
        }
    }

    @PluginMethod
    public void hasFolder(PluginCall call) {
        String uri = getContext().getSharedPreferences(PREFS, 0).getString(FOLDER_KEY, null);
        JSObject ret = new JSObject();
        ret.put("selected", uri != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void writeBackup(PluginCall call) {
        String content = call.getString("content");
        if (content == null) { call.reject("Backup content is missing."); return; }
        String saved = getContext().getSharedPreferences(PREFS, 0).getString(FOLDER_KEY, null);
        if (saved == null) { call.reject("Choose a backup folder first."); return; }
        try {
            Uri tree = Uri.parse(saved);
            ContentResolver resolver = getContext().getContentResolver();
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri existing = null;
            Cursor cursor = resolver.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
            if (cursor != null) {
                try {
                    while (cursor.moveToNext()) {
                        if (BACKUP_NAME.equals(cursor.getString(1))) {
                            existing = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
                            break;
                        }
                    }
                } finally { cursor.close(); }
            }
            if (existing != null) DocumentsContract.deleteDocument(resolver, existing);
            Uri file = DocumentsContract.createDocument(resolver, DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)), "application/json", BACKUP_NAME);
            if (file == null) throw new IllegalStateException("Could not create the backup file in the selected folder.");
            OutputStream stream = resolver.openOutputStream(file, "wt");
            if (stream == null) throw new IllegalStateException("Could not write the backup file.");
            try { stream.write(content.getBytes(StandardCharsets.UTF_8)); stream.flush(); } finally { stream.close(); }
            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("fileName", BACKUP_NAME);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the library backup. Check that the selected folder is still available.", e);
        }
    }

    @PluginMethod
    public void restoreBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "backupPicked");
    }

    @ActivityCallback
    private void backupPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Backup selection cancelled.");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            int flags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
            InputStream stream = getContext().getContentResolver().openInputStream(uri);
            if (stream == null) throw new IllegalStateException("Could not open the selected backup.");
            BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) content.append(line).append('\n');
            reader.close();
            JSObject ret = new JSObject();
            ret.put("content", content.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read the selected backup file.", e);
        }
    }
}
