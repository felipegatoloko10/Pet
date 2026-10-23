package app.pingo.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "PingoNative", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public final class PingoNative extends Plugin {
    private static final Set<String> KEYS = new java.util.HashSet<>(java.util.Arrays.asList("session", "login", "installation"));
    private TextToSpeech speech;
    private boolean speechReady;
    @Override public void load() {
        NotificationCoordinator.channels(getContext());
        getActivity().runOnUiThread(() -> { speech = new TextToSpeech(getContext(), status -> { speechReady = status == TextToSpeech.SUCCESS; if (speechReady) speech.setLanguage(new Locale("pt", "BR")); }); });
    }
    private void fail(PluginCall call) { call.reject("Não foi possível acessar o armazenamento protegido do Pingo."); }
    private String key(PluginCall call) throws Exception { String k = call.getString("key"); if (!KEYS.contains(k)) throw new Exception("Invalid key"); return k; }
    private String user(PluginCall call) throws Exception {
        String u = call.getString("userId"); if (u == null || u.isEmpty() || !u.equals(NotificationCoordinator.prefs(getContext()).getString("userId", ""))) throw new Exception("Invalid account"); return u;
    }
    @PluginMethod public void readSecure(PluginCall call) {
        try { call.resolve(new JSObject().put("value", new SecureStore(getContext()).get(key(call)))); } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void writeSecure(PluginCall call) {
        try { new SecureStore(getContext()).put(key(call), call.getString("value")); call.resolve(); } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void bindAccount(PluginCall call) {
        try {
            String u = call.getString("userId"); if (u == null || u.isEmpty() || u.length() > 200) throw new Exception();
            String prior = NotificationCoordinator.prefs(getContext()).getString("userId", "");
            if (!prior.equals(u)) { NotificationCoordinator.clear(getContext()); NotificationCoordinator.prefs(getContext()).edit().putString("userId", u).commit(); }
            call.resolve();
        } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void readCache(PluginCall call) {
        try { call.resolve(new JSObject().put("value", PingoDatabase.get(getContext()).read(user(call), call.getString("key")))); } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void writeCache(PluginCall call) {
        try { PingoDatabase.get(getContext()).write(user(call), call.getString("key"), call.getString("value")); call.resolve(); } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void clearCache(PluginCall call) {
        try { PingoDatabase.get(getContext()).clear(user(call)); call.resolve(); } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void flushOperations(PluginCall call) {
        try {String u=user(call);String snapshot=OperationWorker.flush(getContext(),u);call.resolve(new JSObject().put("snapshot",snapshot==null?JSONObject.NULL:snapshot));}catch(Exception ignored){try{String snapshot=PingoDatabase.get(getContext()).read(user(call),"snapshot");call.resolve(new JSObject().put("snapshot",snapshot==null?JSONObject.NULL:snapshot));}catch(Exception e){fail(call);}}
    }
    @PluginMethod public void discardOperations(PluginCall call) {try{PingoDatabase.get(getContext()).discardPending(user(call));call.resolve();}catch(Exception ignored){fail(call);}}
    @PluginMethod public void syncReminders(PluginCall call) {
        try {
            String u = user(call);
            JSONObject config = new JSONObject(); config.put("timezone", call.getString("timezone")); config.put("quietStart", call.getString("quietStart")); config.put("quietEnd", call.getString("quietEnd"));
            JSONArray reminders = call.getArray("reminders");
            if (reminders == null || reminders.length() > 1000) throw new Exception();
            NotificationCoordinator.replace(getContext(), u, config, reminders); call.resolve();
        } catch (Exception ignored) { call.reject("Não consegui atualizar os lembretes locais."); }
    }
    @PluginMethod public void enableNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "notificationsGranted");
        else { NotificationCoordinator.prefs(getContext()).edit().putBoolean("enabled", true).commit(); token(call, true); }
    }
    @PermissionCallback private void notificationsGranted(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) { call.reject("A permissão de notificações não foi concedida. Você pode ativá-la nos Ajustes do Android."); return; }
        NotificationCoordinator.prefs(getContext()).edit().putBoolean("enabled", true).commit(); token(call, true);
    }
    private void token(PluginCall call, boolean required) {
        try {
            if (FirebaseApp.getApps(getContext()).isEmpty()) {
                if (required) call.reject("Este APK ainda precisa da configuração de notificações Android do administrador.");
                else call.resolve(new JSObject().put("token", JSONObject.NULL));
                return;
            }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(result -> {
                if (!result.isSuccessful()) { if (required) call.reject("Não consegui registrar este aparelho. Verifique sua conexão."); else call.resolve(new JSObject().put("token", JSONObject.NULL)); }
                else { NotificationCoordinator.restore(getContext()); call.resolve(new JSObject().put("token", result.getResult())); }
            });
        } catch (Exception ignored) { call.reject("O serviço de notificações não está disponível."); }
    }
    @PluginMethod public void getPushToken(PluginCall call) {
        if (!NotificationCoordinator.prefs(getContext()).getBoolean("enabled", false)) { call.resolve(new JSObject().put("token", JSONObject.NULL)); return; }
        token(call, false);
    }
    @PluginMethod public void settings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean allowed = Build.VERSION.SDK_INT < 31 || getContext().getSystemService(AlarmManager.class).canScheduleExactAlarms();
            boolean precise = allowed && NotificationCoordinator.prefs(getContext()).getBoolean("precise", false);
            String[] items = { "Permissão e som das notificações", precise ? "Usar lembretes inexatos" : "Permitir lembretes mais precisos" };
            new androidx.appcompat.app.AlertDialog.Builder(getContext()).setTitle("Lembretes do Pingo").setItems(items, (dialog, choice) -> {
                if (choice == 0) { Intent i = Build.VERSION.SDK_INT >= 26 ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()) : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())); getActivity().startActivity(i); }
                else if (Build.VERSION.SDK_INT >= 31 && !allowed) { NotificationCoordinator.prefs(getContext()).edit().putBoolean("precise", true).apply(); getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()))); }
                else { NotificationCoordinator.prefs(getContext()).edit().putBoolean("precise", !precise).apply(); NotificationCoordinator.restore(getContext()); }
            }).setNegativeButton("Fechar", null).show(); call.resolve();
        });
    }
    @PluginMethod public void getPrivacy(PluginCall call) { call.resolve(new JSObject().put("hidden", NotificationCoordinator.prefs(getContext()).getBoolean("hidden", false))); }
    @PluginMethod public void setPrivacy(PluginCall call) { NotificationCoordinator.prefs(getContext()).edit().putBoolean("hidden", Boolean.TRUE.equals(call.getBoolean("hidden"))).commit(); call.resolve(); }
    @PluginMethod public void logout(PluginCall call) {
        try {
            SecureStore secure = new SecureStore(getContext()); String token = secure.get("session"), install = secure.get("installation");
            if (token != null && install != null) secure.put("pending-unregister", new JSONObject().put("token", token).put("installation", install).toString());
            String prior = NotificationCoordinator.prefs(getContext()).getString("userId", "");
            NotificationCoordinator.clear(getContext()); PingoDatabase.get(getContext()).clear(prior);
            NotificationCoordinator.prefs(getContext()).edit().putBoolean("enabled", false).commit();
            secure.put("session", null); secure.put("login", null);
            if (!FirebaseApp.getApps(getContext()).isEmpty()) FirebaseMessaging.getInstance().deleteToken();
            TokenRegistrationWorker.enqueue(getContext()); stopSpeechNow(); call.resolve();
        } catch (Exception ignored) { fail(call); }
    }
    @PluginMethod public void speak(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> { if (speechReady && speech != null) speech.speak(text.substring(0, Math.min(text.length(), 2000)), TextToSpeech.QUEUE_FLUSH, null, "pingo-balloon"); call.resolve(); });
    }
    private void stopSpeechNow() { if (speech != null) speech.stop(); }
    @PluginMethod public void stopSpeech(PluginCall call) { getActivity().runOnUiThread(() -> { stopSpeechNow(); call.resolve(); }); }
    private JSObject notice(Intent intent) {
        JSObject result = new JSObject();
        if (intent != null && "pingo.NOTICE".equals(intent.getAction())) {
                result.put("noticeId", intent.getStringExtra("noticeId")); result.put("eventId", intent.getStringExtra("eventId")); result.put("taskId",intent.getStringExtra("taskId")); intent.setAction(null);
        }
        return result;
    }
    @PluginMethod public void consumeNotice(PluginCall call) { call.resolve(notice(getActivity().getIntent())); }
    @Override protected void handleOnNewIntent(Intent intent) { JSObject data = notice(intent); if (data.length() > 0) notifyListeners("noticeOpen", data, true); }
    @Override protected void handleOnResume() { NotificationCoordinator.restore(getContext()); }
    @Override protected void handleOnPause() { stopSpeechNow(); }
    @Override protected void handleOnDestroy() { if (speech != null) { speech.stop(); speech.shutdown(); } }
}
