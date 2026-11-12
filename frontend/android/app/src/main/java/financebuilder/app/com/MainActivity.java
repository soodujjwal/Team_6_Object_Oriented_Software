package financebuilder.app.com;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(PlaidLinkPlugin.class);
        registerPlugin(CsvExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
