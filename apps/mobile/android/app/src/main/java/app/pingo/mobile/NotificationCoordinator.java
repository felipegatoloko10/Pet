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
                long now = System.currentTimeMillis();
                if (n.optLong("expiresAt", 0) <= now) return;
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
                if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
                SQLiteDatabase db = PingoDatabase.get(c).getWritableDatabase();
                try (Cursor delivered = db.rawQuery("SELECT 1 FROM deliveries WHERE id=? AND user_id=?", new String[]{id, userId})) { if (delivered.moveToFirst()) return; }
                channels(c);
                boolean hidden = prefs(c).getBoolean("hidden", false), silent = n.optBoolean("silent", false) || quiet(c, now);
                Intent open = new Intent(c, MainActivity.class).setAction("pingo.NOTICE").setData(Uri.parse("pingo-notice:" + Uri.encode(id))).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                open.putExtra("noticeId", id); open.putExtra("eventId", n.optString("eventId", ""));
                PendingIntent pending = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification publicVersion = new NotificationCompat.Builder(c, SILENT).setSmallIcon(R.drawable.ic_notification).setContentTitle("Pingo").setContentText("Você tem um lembrete do Pingo").build();
                NotificationCompat.Builder builder = new NotificationCompat.Builder(c, silent ? SILENT : NORMAL).setSmallIcon(R.drawable.ic_notification).setContentTitle(n.optString("title", "Pingo")).setContentText(n.optString("body", "Você tem um lembrete do Pingo")).setAutoCancel(true).setOnlyAlertOnce(true).setContentIntent(pending).setVisibility(hidden ? NotificationCompat.VISIBILITY_PRIVATE : NotificationCompat.VISIBILITY_PUBLIC).setPublicVersion(publicVersion);
                if (silent) builder.setSilent(true);
                NotificationManagerCompat.from(c).notify(id, 0, builder.build());
                ContentValues row = new ContentValues(); row.put("id", id); row.put("user_id", userId); row.put("at", now);
                db.insertWithOnConflict("deliveries", null, row, SQLiteDatabase.CONFLICT_IGNORE);
                c.getSystemService(AlarmManager.class).cancel(alarmIntent(c, id));
            } catch (Exception ignored) { /* Never log notification contents, credentials or tokens. */ }
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
