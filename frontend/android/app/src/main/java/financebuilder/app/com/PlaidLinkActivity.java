package financebuilder.app.com;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.appcompat.app.AppCompatActivity;
import com.plaid.link.OpenPlaidLink;
import com.plaid.link.Plaid;
import com.plaid.link.PlaidSession;
import com.plaid.link.configuration.LinkTokenConfiguration;
import com.plaid.link.result.LinkExit;
import com.plaid.link.result.LinkInstitution;
import com.plaid.link.result.LinkSuccess;

/** Private lifecycle owner: SDK OAuth results survive activity recreation. */
public class PlaidLinkActivity extends AppCompatActivity {
    private PlaidSession session;
    private final ActivityResultLauncher<PlaidSession> launcher = registerForActivityResult(new OpenPlaidLink(), result -> {
        Intent data = new Intent();
        if (result instanceof LinkSuccess) {
            LinkSuccess success = (LinkSuccess) result;
            data.putExtra("publicToken", success.getPublicToken());
            LinkInstitution institution = success.getMetadata().getInstitution();
            if (institution != null) {
                data.putExtra("institutionId", institution.getId());
                data.putExtra("institutionName", institution.getName());
            }
            setResult(Activity.RESULT_OK, data);
        } else {
            data.putExtra("failed", result instanceof LinkExit && ((LinkExit) result).getError() != null);
            setResult(Activity.RESULT_CANCELED, data);
        }
        finish();
    });

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // The ActivityResultRegistry restores a pending SDK/OAuth result. Never
        // replay a used token by reopening the session after recreation.
        if (state != null) return;
        String token = getIntent().getStringExtra("linkToken");
        getIntent().removeExtra("linkToken");
        if (token == null || token.isBlank()) { finish(); return; }
        try {
            session = Plaid.createPlaidLinkSession(this, new LinkTokenConfiguration.Builder().token(token).build());
            launcher.launch(session);
        } catch (RuntimeException error) {
            setResult(Activity.RESULT_CANCELED, new Intent().putExtra("failed", true));
            finish();
        }
    }

    @Override protected void onDestroy() {
        if (isFinishing() && session != null) session.destroy();
        super.onDestroy();
    }
}
