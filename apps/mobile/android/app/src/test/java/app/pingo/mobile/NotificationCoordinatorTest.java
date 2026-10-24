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
        PingoDatabase.get(c).clear("alice");
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
    @Test public void snapshotAndQueueAreAnAtomicAccountScopedValue() throws Exception {
        PingoDatabase db = PingoDatabase.get(c);
        JSONObject op=new JSONObject().put("operationId","once").put("command",new JSONObject().put("type","pet.care").put("action","pet"));
        JSONObject snapshot=new JSONObject().put("workspace",new JSONObject()).put("pending",new JSONArray().put(new JSONObject().put("operation",op)));
        db.write("alice","snapshot",snapshot.toString());db.write("bob","snapshot",snapshot.toString());db.clear("bob");
        assertEquals(1,new JSONObject(db.read("alice","snapshot")).getJSONArray("pending").length());assertNull(db.read("bob","snapshot"));
        db.acknowledge("alice","once",new JSONObject());db.write("alice","snapshot",snapshot.toString());
        assertEquals("Uma cópia antiga não pode ressuscitar uma operação confirmada.",0,new JSONObject(db.read("alice","snapshot")).getJSONArray("pending").length());
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
    JSONObject timedTask() throws Exception {
        String start=TaskActions.iso(System.currentTimeMillis()-60000),end=TaskActions.iso(System.currentTimeMillis()+1800000);
        JSONObject t=new JSONObject().put("id","task").put("boardId","b").put("columnId","todo").put("title","Teste").put("revision",1).put("completed",false).put("scheduledStart",start).put("scheduledEnd",end);
        JSONArray cols=new JSONArray().put(new JSONObject().put("id","todo").put("kind","todo")).put(new JSONObject().put("id","active").put("kind","active")).put(new JSONObject().put("id","done").put("kind","done"));
        JSONObject w=new JSONObject().put("tasks",new JSONArray().put(t)).put("boards",new JSONArray().put(new JSONObject().put("id","b").put("columns",cols))).put("preferences",new JSONObject().put("taskCheckIns",true));
        PingoDatabase.get(c).write("alice","snapshot",new JSONObject().put("workspace",w).put("pending",new JSONArray()).toString());
        return message("alice","task:phase").put("taskId","task").put("phase","start").put("scheduleKey",start+"|"+end).put("taskRevision",1).put("operationId",java.util.UUID.randomUUID().toString());
    }
    @Test public void taskNoticeOffersThreeActionsAndRejectsOldSchedule() throws Exception {
        JSONObject n=timedTask();NotificationCoordinator.deliver(c,n);
        android.service.notification.StatusBarNotification[] visible=c.getSystemService(NotificationManager.class).getActiveNotifications();
        assertEquals(1,visible.length);assertEquals(3,visible[0].getNotification().actions.length);assertEquals("Comecei",visible[0].getNotification().actions[0].title.toString());
        NotificationCoordinator.deliver(c,new JSONObject(n.toString()).put("noticeId","old").put("scheduleKey","old"));
        assertEquals(1,c.getSystemService(NotificationManager.class).getActiveNotifications().length);
    }
    @Test public void offlineNotificationActionSharesQueueAndPreservesPlannedTime() throws Exception {
        JSONObject n=timedTask();String before=new JSONObject(PingoDatabase.get(c).read("alice","snapshot")).getJSONObject("workspace").getJSONArray("tasks").getJSONObject(0).getString("scheduledStart");
        try{androidx.work.WorkManager.initialize(c,new androidx.work.Configuration.Builder().build());}catch(IllegalStateException ignored){}
        TaskActions.enqueue(c,n,"start");
        JSONObject snapshot=new JSONObject(PingoDatabase.get(c).read("alice","snapshot")), t=snapshot.getJSONObject("workspace").getJSONArray("tasks").getJSONObject(0);
        assertEquals("active",t.getString("columnId"));assertEquals(before,t.getString("scheduledStart"));assertEquals(1,snapshot.getJSONArray("pending").length());assertEquals(n.getString("operationId"),snapshot.getJSONArray("pending").getJSONObject(0).getJSONObject("operation").getString("operationId"));
        assertTrue(t.has("actualStartedAt"));
    }
    @Test public void completingOfflineRejectsLatePushForTheSameTask() throws Exception {
        JSONObject n=timedTask().put("phase","end");
        try{androidx.work.WorkManager.initialize(c,new androidx.work.Configuration.Builder().build());}catch(IllegalStateException ignored){}
        TaskActions.enqueue(c,n,"complete");
        NotificationCoordinator.deliver(c,new JSONObject(n.toString()).put("noticeId","late"));
        assertEquals(0,c.getSystemService(NotificationManager.class).getActiveNotifications().length);
        assertEquals(1,PingoDatabase.get(c).pending("alice").length());
    }

    @Test public void compactNotificationNamesTaskAndKeepsStatusButtonsVisible()throws Exception{
        JSONObject n=timedTask();NotificationCoordinator.deliver(c,n);
        android.app.Notification notification=c.getSystemService(NotificationManager.class).getActiveNotifications()[0].getNotification();
        assertNotNull(notification.contentView);
        android.view.View view=notification.contentView.apply(c,new android.widget.FrameLayout(c));
        assertNotNull(view.findViewById(R.id.status_start));assertNotNull(view.findViewById(R.id.status_complete));assertNotNull(view.findViewById(R.id.status_pending));
        assertEquals(n.getString("title"),((android.widget.TextView)view.findViewById(R.id.task_title)).getText().toString());
        assertEquals(android.view.View.VISIBLE,view.findViewById(R.id.status_complete).getVisibility());
        android.content.Intent opened=org.robolectric.Shadows.shadowOf(notification.contentIntent).getSavedIntent();assertFalse(opened.hasExtra("taskId"));assertFalse(opened.hasExtra("eventId"));
    }
    @Test public void equivalentGoogleTimeZoneDoesNotInvalidateNotification()throws Exception{
        JSONObject n=timedTask();String key=n.getString("scheduleKey");
        assertEquals(TaskActions.canonicalKey(key),key);
        assertEquals("2026-10-23T21:00:00.000Z|2026-10-23T21:30:00.000Z",TaskActions.canonicalKey("2026-10-23T18:00:00-03:00|2026-10-23T18:30:00-03:00"));
    }
    @Test public void failedOtherTaskDoesNotBlockIndependentNotificationAction()throws Exception{
        JSONObject bad=new JSONObject().put("error","Revisar").put("operation",new JSONObject().put("command",new JSONObject().put("type","task.upsert").put("task",new JSONObject().put("id","a"))));
        JSONObject good=new JSONObject().put("operation",new JSONObject().put("operationId","next").put("command",new JSONObject().put("type","task.checkIn").put("id","b")));
        assertEquals("next",OperationWorker.nextEntry(new JSONArray().put(bad).put(good)).getJSONObject("operation").getString("operationId"));
        good.getJSONObject("operation").getJSONObject("command").put("id","a");assertNull(OperationWorker.nextEntry(new JSONArray().put(bad).put(good)));
    }
}
