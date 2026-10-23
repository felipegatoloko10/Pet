package app.pingo.mobile;
import static org.junit.Assert.*;
import static org.junit.Assume.*;
import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Explicit opt-in production smoke test, exclusively with a short-lived disposable QA account. */
@RunWith(AndroidJUnit4.class)
public class MobileCloudInstrumentedTest {
    @Test public void receivesCloudReminderWithNoActivityOpen() throws Exception {
        String path = InstrumentationRegistry.getArguments().getString("fixturePath");
        assumeTrue(path != null && path.startsWith("/data/local/tmp/pingo-android-e2e-"));
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject fixture;
        try (FileInputStream in = new FileInputStream(path)) { fixture = new JSONObject(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)); }
        String userId = fixture.getString("userId");
        assertTrue(userId.startsWith("pingo-android-e2e-"));
        SecureStore secure = new SecureStore(c);
        assertNull("Use um emulador limpo para este teste.", secure.get("session"));
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant app.pingo.mobile " + Manifest.permission.POST_NOTIFICATIONS).close();
            SystemClock.sleep(500);
        }
        NotificationCoordinator.clear(c);
        NotificationCoordinator.prefs(c).edit().putString("userId", userId).putBoolean("enabled", true).commit();
        String installation = UUID.randomUUID().toString();
        secure.put("session", fixture.getString("token")); secure.put("installation", installation);
        try {
            if (FirebaseApp.getApps(c).isEmpty()) FirebaseApp.initializeApp(c);
            String push = Tasks.await(FirebaseMessaging.getInstance().getToken(), 45, TimeUnit.SECONDS);
            assertEquals(200, TokenRegistrationWorker.send("POST", fixture.getString("token"), installation, push));
            try (FileOutputStream out = new FileOutputStream(new File(c.getFilesDir(), "pingo-e2e-ready"))) { out.write("ready".getBytes()); }
            boolean received = false;
            for (int i = 0; i < 120; i++) {
                for (android.service.notification.StatusBarNotification n : c.getSystemService(NotificationManager.class).getActiveNotifications()) if (fixture.getString("noticeId").equals(n.getTag())) received = true;
                if (received) break;
                SystemClock.sleep(1000);
            }
            assertTrue("O lembrete FCM precisa aparecer mesmo sem Activity aberta.", received);
        } finally {
            try { TokenRegistrationWorker.send("DELETE", fixture.getString("token"), installation, null); } catch (Exception ignored) {}
            secure.put("session", null); secure.put("installation", null); NotificationCoordinator.clear(c);
            new File(c.getFilesDir(), "pingo-e2e-ready").delete();
            new File(path).delete();
        }
    }
}
