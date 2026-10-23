package app.pingo.mobile;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.WorkManager;
import androidx.work.OneTimeWorkRequest;
import androidx.work.ExistingWorkPolicy;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Token rotation and offline sign-out cleanup never require the WebView to be alive. */
public final class TokenRegistrationWorker extends Worker {
    static final String API = "https://pingo-gilt.vercel.app/api/v1/mobile/devices";
    public TokenRegistrationWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
    static void enqueue(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork("pingo-token-registration", ExistingWorkPolicy.APPEND_OR_REPLACE,
            new OneTimeWorkRequest.Builder(TokenRegistrationWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());
    }
    static int send(String method, String token, String installation, String fcm) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(API).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Authorization", "Bearer " + token); connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        JSONObject data = new JSONObject(); data.put("installationId", installation); if (fcm != null) data.put("token", fcm);
        try (java.io.OutputStream out = connection.getOutputStream()) { out.write(data.toString().getBytes(StandardCharsets.UTF_8)); }
        try { return connection.getResponseCode(); } finally { connection.disconnect(); }
    }
    @NonNull @Override public Result doWork() {
        try {
            Context c = getApplicationContext(); SecureStore secure = new SecureStore(c);
            String cleanup = secure.get("pending-unregister");
            if (cleanup != null) {
                JSONObject saved = new JSONObject(cleanup);
                int code = send("DELETE", saved.getString("token"), saved.getString("installation"), null);
                if (code >= 500 || code == 429) return Result.retry();
                secure.put("pending-unregister", null);
            }
            String token = secure.get("session"), installation = secure.get("installation");
            if (token == null || installation == null || !NotificationCoordinator.prefs(c).getBoolean("enabled", false) || NotificationCoordinator.prefs(c).getString("userId", "").isEmpty()) return Result.success();
            if (FirebaseApp.getApps(c).isEmpty()) return Result.success();
            String fcm = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
            int code = send("POST", token, installation, fcm);
            return code == 429 || code >= 500 ? Result.retry() : Result.success();
        } catch (Exception ignored) { return getRunAttemptCount() < 6 ? Result.retry() : Result.failure(); }
    }
}
