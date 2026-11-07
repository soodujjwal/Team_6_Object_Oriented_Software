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

/** Transfers ephemeral Link results only. Bank credentials remain inside Plaid. */
@CapacitorPlugin(name = "FinancePlaid")
public class PlaidLinkPlugin extends Plugin {
    private boolean opening;

    @PluginMethod
    public void open(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (opening) { call.reject("A bank connection is already open."); return; }
            String token = call.getString("token");
            if (token == null || token.isBlank() || token.length() > 1024) { call.reject("A fresh Link token is required."); return; }
            opening = true;
            Intent intent = new Intent(getContext(), PlaidLinkActivity.class);
            intent.putExtra("linkToken", token);
            try { startActivityForResult(call, intent, "linkResult"); }
            catch (RuntimeException error) { opening = false; call.reject("Could not open the bank connection. Please retry."); }
        });
    }

    @ActivityCallback
    private void linkResult(PluginCall call, ActivityResult result) {
        opening = false;
        if (call == null) return;
        Intent data = result.getData();
        if (data != null && data.getBooleanExtra("failed", false)) {
            call.reject("Plaid could not finish connecting. Please retry or use Finance Builder in your browser.", "PLAID_LINK_FAILED");
            return;
        }
        JSObject response = new JSObject();
        String token = data == null ? null : data.getStringExtra("publicToken");
        if (result.getResultCode() != Activity.RESULT_OK || token == null || token.isBlank()) {
            response.put("status", "cancelled");
        } else {
            response.put("status", "success");
            response.put("publicToken", token);
            JSObject metadata = new JSObject();
            if (data.getStringExtra("institutionId") != null) {
                JSObject institution = new JSObject();
                institution.put("institution_id", data.getStringExtra("institutionId"));
                institution.put("name", data.getStringExtra("institutionName"));
                metadata.put("institution", institution);
            }
            response.put("metadata", metadata);
        }
        call.resolve(response);
    }
}
