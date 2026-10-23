package app.pingo.mobile;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.content.ContentValues;

final class PingoDatabase extends SQLiteOpenHelper {
    private static volatile PingoDatabase instance;
    static PingoDatabase get(Context c) {
        if (instance == null) synchronized (PingoDatabase.class) { if (instance == null) instance = new PingoDatabase(c.getApplicationContext()); }
        return instance;
    }
    private PingoDatabase(Context c) { super(c, "pingo-mobile.db", null, 1); setWriteAheadLoggingEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE cache(user_id TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,PRIMARY KEY(user_id,k))");
        db.execSQL("CREATE TABLE reminders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL)");
        db.execSQL("CREATE TABLE deliveries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,at INTEGER NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Migration required"); }
    String read(String userId, String key) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT v FROM cache WHERE user_id=? AND k=?", new String[]{ userId, key })) { return c.moveToFirst() ? c.getString(0) : null; }
    }
    void write(String userId, String key, String value) {
        ContentValues row = new ContentValues(); row.put("user_id", userId); row.put("k", key); row.put("v", value);
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try { db.insertWithOnConflict("cache", null, row, SQLiteDatabase.CONFLICT_REPLACE); db.setTransactionSuccessful(); } finally { db.endTransaction(); }
    }
    void clear(String userId) { getWritableDatabase().delete("cache", "user_id=?", new String[]{userId}); }
}
