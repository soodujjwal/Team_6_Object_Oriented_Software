package financebuilder.app.com;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only an encrypted session is persisted; the AES key never leaves Android Keystore. */
@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "FinanceBuilderSessionV1";
    private SharedPreferences preferences() { return getContext().getSharedPreferences("secure_session", Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }

    @PluginMethod
    public synchronized void read(PluginCall call) {
        try {
            String data = preferences().getString("ciphertext", null);
            JSObject result = new JSObject();
            if (data != null) {
                String iv = preferences().getString("iv", "");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
                result.put("value", new String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) {
            // A removed/invalidated device key requires sign-in, never plaintext fallback.
            preferences().edit().clear().commit();
            call.resolve(new JSObject());
        }
    }

    @PluginMethod
    public synchronized void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) { call.reject("Missing session."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            boolean saved = preferences().edit()
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString("ciphertext", Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP)).commit();
            if (!saved) throw new Exception("Storage unavailable");
            call.resolve();
        } catch (Exception error) { call.reject("Could not securely save your session. Please try again."); }
    }

    @PluginMethod
    public synchronized void clear(PluginCall call) {
        if (preferences().edit().clear().commit()) call.resolve();
        else call.reject("Could not clear the saved session.");
    }
}
