package financebuilder.app.com;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.SystemClock;
import android.view.KeyEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Opt-in live verification; creates and removes only its own disposable account. */
@RunWith(AndroidJUnit4.class)
public class ReleaseReadinessTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            ready.countDown();
        }));
        assertTrue("WebView did not respond", ready.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void await(ActivityScenario<MainActivity> scenario, String condition, String label) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 120000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "Boolean(" + condition + ")"))) return;
            SystemClock.sleep(500);
        }
        fail("Timed out: " + label);
    }

    private void fill(ActivityScenario<MainActivity> scenario, String selector, String value) throws Exception {
        evaluate(scenario, "(()=>{const e=document.querySelector(" + JSONObject.quote(selector)
            + ");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"
            + JSONObject.quote(value) + ");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }

    private void back() {
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        SystemClock.sleep(750);
    }

    @Test public void disposableAccountAuthenticationStorageNavigationAndErrors() throws Exception {
        org.junit.Assume.assumeTrue("Live test requires explicit opt-in",
            "true".equals(InstrumentationRegistry.getArguments().getString("financeLiveVerification")));
        String email = "android-verify-" + UUID.randomUUID() + "@example.test";
        String password = "Aa1!" + UUID.randomUUID();
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "!!document.querySelector('input[type=email]')", "logged-out startup");
            evaluate(scenario, "window.__verificationErrors=[];window.addEventListener('error',()=>window.__verificationErrors.push('error'));window.addEventListener('unhandledrejection',()=>window.__verificationErrors.push('rejection'));document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('Create a new account'))b.click()})");
            await(scenario, "!!document.querySelector('input[type=tel]')", "registration form");
            fill(scenario, "input:not([type]),input[type=text]", "Android Verification");
            fill(scenario, "input[type=email]", email);
            fill(scenario, "input[type=tel]", "(202) 555-0148");
            fill(scenario, "input[type=password]", password);
            // Password controls have separate wrappers, so address the second input explicitly.
            evaluate(scenario, "(()=>{const e=document.querySelectorAll('input[type=password]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e," + JSONObject.quote(password) + ");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
            evaluate(scenario, "document.querySelector('form').requestSubmit()");
            await(scenario, "!!document.querySelector('.onboarding-skip')", "test account registration and onboarding");
            evaluate(scenario, "document.querySelector('.onboarding-skip').click()");
            await(scenario, "!!document.querySelector('.bottom-nav')", "dashboard startup");
            try {
                assertEquals("\"https://localhost\"", evaluate(scenario, "location.origin"));
                assertEquals("true", evaluate(scenario, "!localStorage.getItem('pfm_access_token')&&!localStorage.getItem('pfm_user')"));
                String ciphertext = context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).getString("ciphertext", "");
                assertFalse("Encrypted session was not persisted", ciphertext.isEmpty());
                assertFalse("Session data must not be plaintext", ciphertext.contains(email));
                assertFalse("Password must not be persisted", ciphertext.contains(password));
                evaluate(scenario, "window.__verifiedUser=false;Capacitor.Plugins.SecureSession.read().then(r=>JSON.parse(r.value)).then(s=>fetch('https://finance-builder-api.onrender.com/auth/me',{headers:{Authorization:'Bearer '+s.token}})).then(r=>r.json()).then(u=>window.__verifiedUser=u.email===" + JSONObject.quote(email) + ")");
                await(scenario, "window.__verifiedUser===true", "authenticated production API access");
                evaluate(scenario, "document.querySelector('.bottom-nav button[title=Budgets]').click()");
                await(scenario, "document.querySelector('.bottom-nav button.active')?.title==='Budgets'", "budget navigation");
                back();
                await(scenario, "document.querySelector('.bottom-nav button.active')?.title==='Home'", "Android Back returns home");
                evaluate(scenario, "document.querySelector('[aria-label=\"Open menu\"]').click()");
                await(scenario, "!!document.querySelector('.drawer-layer.open')", "drawer opens");
                back();
                await(scenario, "!document.querySelector('.drawer-layer.open')", "Android Back closes drawer");
                scenario.recreate();
                await(scenario, "!!document.querySelector('.bottom-nav')", "encrypted-session restoration after recreation");
                evaluate(scenario, "document.querySelector('[aria-label=\"Open menu\"]').click();document.querySelectorAll('.drawer-nav button').forEach(b=>{if(b.textContent==='Logout')b.click()})");
                await(scenario, "!!document.querySelector('input[type=email]')", "logout returns to native login");
                await(scenario, "!localStorage.getItem('pfm_access_token')", "plaintext credential absence after logout");
                long clearDeadline = SystemClock.elapsedRealtime() + 10000;
                while (context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).contains("ciphertext") && SystemClock.elapsedRealtime() < clearDeadline) SystemClock.sleep(100);
                assertFalse("Logout must remove ciphertext", context.getSharedPreferences("secure_session", Context.MODE_PRIVATE).contains("ciphertext"));
                fill(scenario, "input[type=email]", email);
                fill(scenario, "input[type=password]", password);
                evaluate(scenario, "document.querySelector('form').requestSubmit()");
                await(scenario, "!!document.querySelector('.bottom-nav')", "login using dedicated account");
            } finally {
                // Cleanup is guarded by this test's exact, randomly generated account email.
                evaluate(scenario, "window.__verificationCleanup='pending';(async()=>{const login=await fetch('https://finance-builder-api.onrender.com/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:" + JSONObject.quote(email) + ",password:" + JSONObject.quote(password) + "})});if(!login.ok)throw Error('test cleanup login failed');const s=await login.json();if(s.user.email!==" + JSONObject.quote(email) + ")throw Error('test account mismatch');const result=await fetch('https://finance-builder-api.onrender.com/auth/me',{method:'DELETE',headers:{Authorization:'Bearer '+s.access_token}});if(!result.ok)throw Error('test cleanup failed');await Capacitor.Plugins.SecureSession.clear();window.__verificationCleanup='complete';})().catch(()=>window.__verificationCleanup='failed')");
                await(scenario, "window.__verificationCleanup==='complete'", "disposable test account cleanup");
                evaluate(scenario, "location.reload()");
                await(scenario, "!!document.querySelector('input[type=email]')", "startup after account removal");
            }
            // Inject a transient network failure only in this WebView, then restore fetch.
            fill(scenario, "input[type=email]", email);
            fill(scenario, "input[type=password]", password);
            evaluate(scenario, "window.__originalFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('test network unavailable'));document.querySelector('form').requestSubmit()");
            await(scenario, "document.querySelector('[role=alert]')?.textContent.includes('Could not reach Finance Builder')", "visible login network error");
            evaluate(scenario, "window.fetch=window.__originalFetch;delete window.__originalFetch");
        }
    }
}
