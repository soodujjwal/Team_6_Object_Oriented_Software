package financebuilder.app.com;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeSmokeTest {
    private MainActivity activity;
    private String evaluate(String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch complete = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            WebView web = activity.getBridge().getWebView();
            web.evaluateJavascript(script, value -> { result.set(value); complete.countDown(); });
        });
        assertTrue("WebView evaluation completed", complete.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void waitFor(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(evaluate(expression))) return;
            Thread.sleep(100);
        }
        fail("Condition not satisfied: " + expression);
    }
    @Test public void bundledAppBootsAndNativeSessionIsEncrypted() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("financebuilder.app.com", context.getPackageName());
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        try {
            waitFor("!!document.querySelector('input[type=email]')");
            assertEquals("\"https://localhost\"", evaluate("location.origin"));
            assertEquals("true", evaluate("document.body.innerText.includes('Welcome back')"));
            assertEquals("true", evaluate("!localStorage.getItem('pfm_access_token')"));
            evaluate("window.__sessionTest='pending'; Capacitor.Plugins.SecureSession.write({value:'native-test-session-not-a-real-token'}).then(()=>Capacitor.Plugins.SecureSession.read()).then(r=>{window.__sessionTest=r.value;}).catch(()=>window.__sessionTest='failed');");
            waitFor("window.__sessionTest==='native-test-session-not-a-real-token'");
            String encrypted = context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).getString("ciphertext", "");
            assertFalse(encrypted.isEmpty());
            assertFalse(encrypted.contains("native-test-session"));
            evaluate("window.__cleared=false;Capacitor.Plugins.SecureSession.clear().then(()=>Capacitor.Plugins.SecureSession.read()).then(r=>window.__cleared=!r.value);");
            waitFor("window.__cleared===true");
            assertFalse(context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).contains("ciphertext"));
        } finally {
            context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).edit().clear().commit();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> activity.finish());
        }
    }
}
