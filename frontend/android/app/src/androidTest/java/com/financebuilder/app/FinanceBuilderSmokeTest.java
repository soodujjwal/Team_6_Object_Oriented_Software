package com.financebuilder.app;

import financebuilder.app.com.MainActivity;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the installed APK. Never signs into or modifies a real account. */
@RunWith(AndroidJUnit4.class)
public class FinanceBuilderSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            ready.countDown();
        }));
        assertTrue("WebView did not respond", ready.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void await(ActivityScenario<MainActivity> scenario, String condition, long timeout) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "Boolean(" + condition + ")"))) return;
            SystemClock.sleep(250);
        }
        throw new AssertionError("Timed out waiting for: " + condition);
    }

    @Test public void launchesNativeLoginWithoutLandingOrDownloadPrompts() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.body && document.body.innerText.includes('Welcome back')", 45000);
            assertEquals("\"android\"", evaluate(scenario, "window.Capacitor.getPlatform()"));
            assertEquals("true", evaluate(scenario, "window.Capacitor.isNativePlatform()"));
            assertEquals("\"/login\"", evaluate(scenario, "location.pathname"));
            assertEquals("true", evaluate(scenario, "!document.querySelector('.lp-hero, .app-download, .auth-back-link')"));
            assertEquals("true", evaluate(scenario, "!!document.querySelector('input[type=email]') && !!document.querySelector('input[type=password]')"));
            Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            if (screenshot != null) {
                File image = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "smoke-login.png");
                try (FileOutputStream stream = new FileOutputStream(image)) { screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream); }
                screenshot.recycle();
            }
        }
    }

    @Test public void registrationRouteWorksWithoutShowingWebsiteLandingPage() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.body && document.body.innerText.includes('Welcome back')", 45000);
            scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl("https://localhost/register"));
            await(scenario, "document.body && document.body.innerText.includes('Create your account')", 45000);
            assertEquals("\"/register\"", evaluate(scenario, "location.pathname"));
            assertEquals("true", evaluate(scenario, "!document.querySelector('.lp-hero') && !document.body.innerText.includes('Back to home')"));
            assertEquals("\"android\"", evaluate(scenario, "window.Capacitor.getPlatform()"));
        }
    }

    @Test public void loginFitsPortraitLandscapeAndActivityRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.body && document.body.innerText.includes('Welcome back')", 45000);
            assertEquals("true", evaluate(scenario, "document.documentElement.scrollWidth <= innerWidth + 1"));
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            await(scenario, "innerWidth > innerHeight", 15000);
            assertEquals("true", evaluate(scenario, "document.documentElement.scrollWidth <= innerWidth + 1"));
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            await(scenario, "innerHeight > innerWidth", 15000);
            scenario.recreate();
            await(scenario, "document.body && document.body.innerText.includes('Welcome back')", 45000);
        }
    }

    @Test public void nativeWebViewCanReachLiveApiAndReceivesAuthenticationErrors() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "document.body && document.body.innerText.includes('Welcome back')", 45000);
            evaluate(scenario, "window.__financeSmoke = null; (async () => { try {"
                + "const base='https://finance-builder-api.onrender.com';"
                + "const health=await fetch(base+'/health'); const data=await health.json();"
                + "const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},"
                + "body:JSON.stringify({email:'apk-smoke-'+Date.now()+'@example.test',password:'invalid-test-only'})});"
                + "const state=await fetch(base+'/auth/state');"
                + "window.__financeSmoke={health:health.status,database:data.database.status,login:login.status,state:state.status};"
                + "} catch(e) { window.__financeSmoke={error:String(e)}; } })();");
            await(scenario, "window.__financeSmoke !== null", 100000);
            assertEquals("200", evaluate(scenario, "window.__financeSmoke.health"));
            assertEquals("\"ok\"", evaluate(scenario, "window.__financeSmoke.database"));
            assertEquals("401", evaluate(scenario, "window.__financeSmoke.login"));
            assertEquals("401", evaluate(scenario, "window.__financeSmoke.state"));
        }
    }
}
