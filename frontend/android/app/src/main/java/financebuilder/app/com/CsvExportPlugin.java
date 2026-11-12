package financebuilder.app.com;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Saves an export only to the document destination selected by the user. */
@CapacitorPlugin(name = "FinanceCsv")
public class CsvExportPlugin extends Plugin {
    private volatile boolean opening;

    @PluginMethod
    public void save(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (opening) { call.reject("An export is already open."); return; }
            String filename = call.getString("filename");
            if (filename == null || !filename.matches("finance-builder-transactions-[a-z0-9-]+\\.csv")
                    || call.getString("content") == null) {
                call.reject("A valid CSV export is required.");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/csv");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            opening = true;
            try { startActivityForResult(call, intent, "saveResult"); }
            catch (RuntimeException error) {
                opening = false;
                call.reject("Could not open Save as. Please retry.");
            }
        });
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) { opening = false; return; }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            opening = false;
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        getBridge().execute(() -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (output == null) throw new IOException("No output stream");
                    output.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (IOException | RuntimeException error) {
                call.reject("The CSV could not be saved. Choose a destination and try again.");
            } finally {
                opening = false;
            }
        });
    }
}
