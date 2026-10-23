package app.pingo.mobile;
import static org.junit.Assert.*;
import android.app.NotificationManager;
import android.content.Context;
import org.robolectric.RuntimeEnvironment;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import org.json.JSONArray;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NotificationCoordinatorTest {
    Context c;
    @Before public void setup() {
        c = RuntimeEnvironment.getApplication();
        NotificationCoordinator.clear(c);
        NotificationCoordinator.prefs(c).edit().putString("userId", "alice").putBoolean("enabled", true).commit();
    }
    JSONObject message(String user, String id) throws Exception {
        return new JSONObject().put("userId", user).put("noticeId", id).put("title", "Teste").put("body", "Em breve").put("expiresAt", System.currentTimeMillis() + 600000);
    }
    @Test public void duplicateDeliveryUsesOneNotification() throws Exception {
        NotificationCoordinator.deliver(c, message("alice", "reminder:1"));
        NotificationCoordinator.deliver(c, message("alice", "reminder:1"));
        assertEquals(1, c.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
    @Test public void anotherAccountAndExpiredMessagesAreIgnored() throws Exception {
        NotificationCoordinator.deliver(c, message("bob", "reminder:2"));
        NotificationCoordinator.deliver(c, message("alice", "reminder:3").put("expiresAt", 1));
        assertEquals(0, c.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
    @Test public void logoutStopsQueuedNotifications() throws Exception {
        NotificationCoordinator.clear(c);
        NotificationCoordinator.deliver(c, message("alice", "reminder:4"));
        assertEquals(0, c.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
    @Test public void snapshotAndQueueAreAnAtomicAccountScopedValue() {
        PingoDatabase db = PingoDatabase.get(c);
        db.write("alice", "snapshot", "{\"workspace\":{},\"pending\":[1]}");
        db.write("bob", "snapshot", "{\"workspace\":{},\"pending\":[2]}");
        db.clear("bob");
        assertTrue(db.read("alice", "snapshot").contains("[1]"));
        assertNull(db.read("bob", "snapshot"));
    }
    @Test public void editedReminderReplacesTheOldAlarmIndex() throws Exception {
        long now = System.currentTimeMillis();
        JSONObject config = new JSONObject().put("timezone", "America/Sao_Paulo").put("quietStart", "22:00").put("quietEnd", "08:00");
        JSONObject old = message("alice", "old").put("startAt", now + 1200000).put("dueAt", now + 100000);
        NotificationCoordinator.replace(c, "alice", config, new JSONArray().put(old));
        NotificationCoordinator.replace(c, "alice", config, new JSONArray());
        NotificationCoordinator.fireLocal(c, "old");
        assertEquals(0, c.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
}
