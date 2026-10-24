package app.pingo.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Shared durable coordinator: local alarms and FCM use the very same tag and delivery ledger. */
final class NotificationCoordinator {
    private static final Object LOCK = new Object();
    private static final String NORMAL = "pingo-reminders", SILENT = "pingo-quiet";
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("pingo-notifications", Context.MODE_PRIVATE); }
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = c.getSystemService(NotificationManager.class);
            NotificationChannel normal = new NotificationChannel(NORMAL, "Lembretes do Pingo", NotificationManager.IMPORTANCE_DEFAULT);
            NotificationChannel silent = new NotificationChannel(SILENT, "Pingo em silêncio", NotificationManager.IMPORTANCE_LOW);
            silent.setSound(null, null); silent.enableVibration(false);
            manager.createNotificationChannel(normal); manager.createNotificationChannel(silent);
        }
    }
    static PendingIntent alarmIntent(Context c, String id) {
        Intent intent = new Intent(c, ReminderReceiver.class).setData(Uri.parse("pingo-reminder:" + Uri.encode(id)));
        intent.putExtra("noticeId", id);
        return PendingIntent.getBroadcast(c, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void schedule(Context c, JSONObject r) throws Exception {
        if (!prefs(c).getBoolean("enabled", false)) return;
        long start = r.getLong("startAt"), due = r.getLong("dueAt");
        if (start <= System.currentTimeMillis()) return;
        AlarmManager manager = c.getSystemService(AlarmManager.class);
        PendingIntent intent = alarmIntent(c, r.getString("noticeId"));
        long at = Math.max(System.currentTimeMillis() + 500, due);
        if (prefs(c).getBoolean("precise", false) && (Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms())) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
    }
    static void replace(Context c, String userId, JSONObject config, JSONArray reminders) throws Exception {
        synchronized (LOCK) {
            if (!userId.equals(prefs(c).getString("userId", ""))) return;
            SQLiteDatabase db = PingoDatabase.get(c).getWritableDatabase();
            try (Cursor rows = db.rawQuery("SELECT id FROM reminders WHERE user_id=?", new String[]{userId})) {
                while (rows.moveToNext()) c.getSystemService(AlarmManager.class).cancel(alarmIntent(c, rows.getString(0)));
            }
            db.beginTransaction();
            try {
                db.delete("reminders", "user_id=?", new String[]{userId});
                for (int i = 0; i < reminders.length(); i++) {
                    JSONObject r = reminders.getJSONObject(i); r.put("userId", userId);
                    ContentValues row = new ContentValues(); row.put("id", r.getString("noticeId")); row.put("user_id", userId); row.put("data", r.toString());
                    db.insertOrThrow("reminders", null, row);
                }
                db.delete("deliveries", "at<?", new String[]{String.valueOf(System.currentTimeMillis() - 30L * 86400000)});
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            prefs(c).edit().putString("config", config.toString()).commit();
            restore(c);
        }
    }
    static void restore(Context c) {
        synchronized (LOCK) {
            String userId = prefs(c).getString("userId", ""); if (userId.isEmpty()) return;
            try (Cursor rows = PingoDatabase.get(c).getReadableDatabase().rawQuery("SELECT data FROM reminders WHERE user_id=?", new String[]{userId})) {
                while (rows.moveToNext()) { try { schedule(c, new JSONObject(rows.getString(0))); } catch (Exception ignored) {} }
            }
        }
    }
    static void fireLocal(Context c, String id) {
        synchronized (LOCK) {
            try (Cursor row = PingoDatabase.get(c).getReadableDatabase().rawQuery("SELECT data FROM reminders WHERE id=? AND user_id=?", new String[]{id, prefs(c).getString("userId", "")})) {
                if (!row.moveToFirst()) return;
                JSONObject r = new JSONObject(row.getString(0));
                long now = System.currentTimeMillis(), starts = r.getLong("startAt");
                if (now < r.getLong("dueAt") - 1000) { schedule(c, r); return; }
                if (starts <= now) return;
                if(!r.optString("taskId").isEmpty()){deliver(c,r);return;}
                r.put("body", "Começa em " + Math.max(0, Math.round((starts - now) / 60000.0)) + " minutos.");
                r.put("expiresAt", starts); deliver(c, r);
            } catch (Exception ignored) {}
        }
    }
    static boolean quiet(Context c, long now) {
        try {
            JSONObject config = new JSONObject(prefs(c).getString("config", "{}"));
            SimpleDateFormat f = new SimpleDateFormat("HH:mm", Locale.ROOT); f.setTimeZone(TimeZone.getTimeZone(config.optString("timezone", "America/Sao_Paulo")));
            String t = f.format(new Date(now)), start = config.optString("quietStart", "22:00"), end = config.optString("quietEnd", "08:00");
            return start.compareTo(end) <= 0 ? t.compareTo(start) >= 0 && t.compareTo(end) < 0 : t.compareTo(start) >= 0 || t.compareTo(end) < 0;
        } catch (Exception ignored) { return true; }
    }
    static void deliver(Context c, JSONObject n) {
        synchronized (LOCK) {
            try {
                String userId = n.getString("userId"), id = n.getString("noticeId");
                if (!prefs(c).getBoolean("enabled", false)) return;
                if (!userId.equals(prefs(c).getString("userId", "")) || userId.isEmpty()) return;
                if(!TaskActions.valid(c,n))return;
                long now = System.currentTimeMillis();
                if (n.optLong("expiresAt", 0) <= now) return;
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
                if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
                SQLiteDatabase db = PingoDatabase.get(c).getWritableDatabase();
                try (Cursor delivered = db.rawQuery("SELECT 1 FROM deliveries WHERE id=? AND user_id=?", new String[]{id, userId})) { if (delivered.moveToFirst()) return; }
                channels(c);
                boolean hidden = prefs(c).getBoolean("hidden", false), silent = n.optBoolean("silent", false) || quiet(c, now);
                Intent open = new Intent(c, MainActivity.class).setAction("pingo.NOTICE").setData(Uri.parse("pingo-notice:" + Uri.encode(id))).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                open.putExtra("noticeId", id);
                PendingIntent pending = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification publicVersion = new NotificationCompat.Builder(c, SILENT).setSmallIcon(R.drawable.ic_notification).setContentTitle("Pingo").setContentText("Você tem um lembrete do Pingo").build();
                NotificationCompat.Builder builder = new NotificationCompat.Builder(c, silent ? SILENT : NORMAL).setSmallIcon(R.drawable.ic_notification).setContentTitle(n.optString("title", "Pingo")).setContentText(n.optString("body", "Você tem um lembrete do Pingo")).setTimeoutAfter(n.optLong("expiresAt")-now).setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(pending).setVisibility(hidden ? NotificationCompat.VISIBILITY_PRIVATE : NotificationCompat.VISIBILITY_PUBLIC).setPublicVersion(publicVersion);
                if(!n.optString("taskId").isEmpty()){
                    android.os.Bundle metadata=new android.os.Bundle();metadata.putString("pingoTaskId",n.getString("taskId"));metadata.putString("pingoPhase",n.optString("phase"));builder.addExtras(metadata);
                    boolean end=n.optString("phase").equals("end")||n.optString("phase").equals("repeat") || n.optString("snoozePhase").equals("end");
                    builder.addAction(taskAction(c,n,end?"complete":"start",end?"Concluir":"Comecei"));
                    builder.addAction(taskAction(c,n,"snooze",end?"Lembrar em 15 min":"Lembrar em 10 min"));
                    builder.addAction(taskAction(c,n,"pending","A fazer"));
                    RemoteViews compact=new RemoteViews(c.getPackageName(),R.layout.task_notification);
                    compact.setTextViewText(R.id.task_title,n.optString("title","Sua tarefa"));
                    compact.setContentDescription(R.id.task_title,n.optString("title","Sua tarefa"));
                    int[] ids={R.id.status_pending,R.id.status_start,R.id.status_waiting,R.id.status_complete};String[] actions={"pending","start","waiting","complete"};
                    for(int j=0;j<ids.length;j++)compact.setOnClickPendingIntent(ids[j],actionIntent(c,n,actions[j]));
                    if(!TaskActions.hasWaiting(c,userId,n.getString("taskId")))compact.setViewVisibility(R.id.status_waiting,android.view.View.GONE);
                    builder.setStyle(new NotificationCompat.DecoratedCustomViewStyle()).setCustomContentView(compact).setCustomHeadsUpContentView(compact);
                }
                if (silent) builder.setSilent(true);
                NotificationManagerCompat.from(c).notify(id, 0, builder.build());
                NotificationManagerCompat.from(c).cancel("pingo-task-group",1);
                ContentValues row = new ContentValues(); row.put("id", id); row.put("user_id", userId); row.put("at", now);
                db.insertWithOnConflict("deliveries", null, row, SQLiteDatabase.CONFLICT_IGNORE);
                c.getSystemService(AlarmManager.class).cancel(alarmIntent(c, id));
            } catch (Exception ignored) { /* Never log notification contents, credentials or tokens. */ }
        }
    }
    static PendingIntent actionIntent(Context c,JSONObject n,String action)throws Exception{
        JSONObject payload=new JSONObject(n.toString());payload.put("operationId",java.util.UUID.randomUUID().toString());
        Intent target=new Intent(c,TaskActionActivity.class).setData(Uri.parse("pingo-action:"+Uri.encode(n.getString("noticeId")+":"+action))).putExtra("payload",payload.toString()).putExtra("taskAction",action);
        return PendingIntent.getActivity(c,0,target,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static NotificationCompat.Action taskAction(Context c,JSONObject n,String action,String label)throws Exception{
        return new NotificationCompat.Action.Builder(0,label,actionIntent(c,n,action)).setAuthenticationRequired(true).build();
    }
    static void afterAction(Context c,JSONObject n,String action)throws Exception{
        synchronized(LOCK){
            String task=n.getString("taskId"),phase=n.optString("phase");boolean end=phase.equals("end")||phase.equals("repeat")||n.optString("snoozePhase").equals("end");
            java.util.ArrayList<String> remove=new java.util.ArrayList<>();
            try(Cursor rows=PingoDatabase.get(c).getReadableDatabase().rawQuery("SELECT id,data FROM reminders WHERE user_id=?",new String[]{n.getString("userId")})){
                while(rows.moveToNext()){JSONObject r=new JSONObject(rows.getString(1));String p=r.optString("phase");if(task.equals(r.optString("taskId"))&&(action.equals("complete")||p.equals("snooze")||p.equals(phase)||(end&&(p.equals("end")||p.equals("repeat")))||(action.equals("start")&&(p.equals("start")||p.equals("before")))))remove.add(rows.getString(0));}
            }
            for(String id:remove){c.getSystemService(AlarmManager.class).cancel(alarmIntent(c,id));PingoDatabase.get(c).getWritableDatabase().delete("reminders","id=?",new String[]{id});NotificationManagerCompat.from(c).cancel(id,0);}
            NotificationManagerCompat.from(c).cancel(n.getString("noticeId"),0);
            if(!action.equals("snooze"))for(android.service.notification.StatusBarNotification shown:c.getSystemService(NotificationManager.class).getActiveNotifications())if(task.equals(shown.getNotification().extras.getString("pingoTaskId")))NotificationManagerCompat.from(c).cancel(shown.getTag(),shown.getId());
            if(action.equals("snooze")){
                String snapshot=PingoDatabase.get(c).read(n.getString("userId"),"snapshot");JSONObject t=TaskActions.task(new JSONObject(snapshot).getJSONObject("workspace"),task);
                if(t!=null){JSONObject check=t.getJSONObject("checkIn"),r=new JSONObject(n.toString());String at=check.getString("snoozeAt");java.text.SimpleDateFormat f=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));long due=f.parse(at).getTime();r.put("snoozePhase",check.optString("snoozePhase")).put("noticeId","task:"+n.getString("userId")+":"+task+":"+n.getString("scheduleKey")+":snooze:"+at).put("phase","snooze").put("dueAt",due).put("startAt",due+900000).put("expiresAt",due+900000).put("body","Vamos retomar “"+n.optString("title")+"”?").put("taskRevision",t.getInt("revision"));ContentValues row=new ContentValues();row.put("id",r.getString("noticeId"));row.put("user_id",n.getString("userId"));row.put("data",r.toString());PingoDatabase.get(c).getWritableDatabase().insertWithOnConflict("reminders",null,row,SQLiteDatabase.CONFLICT_REPLACE);schedule(c,r);}
            }
            NotificationManagerCompat.from(c).cancel("pingo-task-group",1);
        }
    }
    static void clear(Context c) {
        synchronized (LOCK) {
            try (Cursor rows = PingoDatabase.get(c).getReadableDatabase().rawQuery("SELECT id FROM reminders", null)) { while (rows.moveToNext()) c.getSystemService(AlarmManager.class).cancel(alarmIntent(c, rows.getString(0))); }
            PingoDatabase.get(c).getWritableDatabase().delete("reminders", null, null);
            PingoDatabase.get(c).getWritableDatabase().delete("deliveries", null, null);
            prefs(c).edit().remove("userId").remove("config").commit();
            NotificationManagerCompat.from(c).cancelAll();
        }
    }
}
