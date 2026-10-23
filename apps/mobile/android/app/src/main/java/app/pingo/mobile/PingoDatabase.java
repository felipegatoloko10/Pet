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
    private PingoDatabase(Context c) { super(c, "pingo-mobile.db", null, 2); setWriteAheadLoggingEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE cache(user_id TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,PRIMARY KEY(user_id,k))");
        db.execSQL("CREATE TABLE reminders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL)");
        db.execSQL("CREATE TABLE deliveries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,at INTEGER NOT NULL)");
        operations(db);
    }
    private void operations(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS pending_operations(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,operation_id TEXT NOT NULL,data TEXT NOT NULL,error TEXT,UNIQUE(user_id,operation_id))");
        db.execSQL("CREATE TABLE IF NOT EXISTS operation_receipts(user_id TEXT NOT NULL,operation_id TEXT NOT NULL,PRIMARY KEY(user_id,operation_id))");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            operations(db);
            try (Cursor rows=db.rawQuery("SELECT user_id,v FROM cache WHERE k='snapshot'",null)) {
                while(rows.moveToNext()) try { importPending(db,rows.getString(0),new org.json.JSONObject(rows.getString(1))); } catch(org.json.JSONException e) { throw new IllegalStateException("Não consegui migrar a fila. A cópia original foi preservada.",e); }
            }
        }
    }
    private void importPending(SQLiteDatabase db,String user,org.json.JSONObject snapshot) throws org.json.JSONException {
        org.json.JSONArray pending=snapshot.optJSONArray("pending"); if(pending==null)return;
        for(int i=0;i<pending.length();i++) {
            org.json.JSONObject entry=pending.getJSONObject(i), op=entry.getJSONObject("operation");String id=op.getString("operationId");
            try(Cursor receipt=db.rawQuery("SELECT 1 FROM operation_receipts WHERE user_id=? AND operation_id=?",new String[]{user,id})){if(receipt.moveToFirst())continue;}
            ContentValues row=new ContentValues();row.put("user_id",user);row.put("operation_id",id);row.put("data",op.toString());if(entry.has("error"))row.put("error",entry.getString("error"));
            db.insertWithOnConflict("pending_operations",null,row,SQLiteDatabase.CONFLICT_IGNORE);
        }
    }
    synchronized org.json.JSONArray pending(String user) throws org.json.JSONException {
        org.json.JSONArray all=new org.json.JSONArray();
        try(Cursor rows=getReadableDatabase().rawQuery("SELECT data,error FROM pending_operations WHERE user_id=? ORDER BY seq",new String[]{user})) {
            while(rows.moveToNext()){org.json.JSONObject entry=new org.json.JSONObject().put("operation",new org.json.JSONObject(rows.getString(0)));if(!rows.isNull(1))entry.put("error",rows.getString(1));all.put(entry);}
        }return all;
    }
    synchronized String read(String userId, String key) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT v FROM cache WHERE user_id=? AND k=?", new String[]{ userId, key })) {
            if(!c.moveToFirst())return null;String value=c.getString(0);
            if(key.equals("snapshot"))try{return new org.json.JSONObject(value).put("pending",pending(userId)).toString();}catch(org.json.JSONException e){throw new IllegalStateException("Cache inválido",e);}
            return value;
        }
    }
    synchronized void write(String userId, String key, String value) {
        ContentValues row = new ContentValues(); row.put("user_id", userId); row.put("k", key); row.put("v", value);
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try { if(key.equals("snapshot")&&!userId.equals("demo"))importPending(db,userId,new org.json.JSONObject(value)); db.insertWithOnConflict("cache", null, row, SQLiteDatabase.CONFLICT_REPLACE); db.setTransactionSuccessful(); } catch(org.json.JSONException e){throw new IllegalStateException("Fila inválida",e);}finally { db.endTransaction(); }
    }
    synchronized void acknowledge(String user,String id,org.json.JSONObject workspace) throws org.json.JSONException {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try {
            ContentValues receipt=new ContentValues();receipt.put("user_id",user);receipt.put("operation_id",id);db.insertWithOnConflict("operation_receipts",null,receipt,SQLiteDatabase.CONFLICT_IGNORE);
            db.delete("pending_operations","user_id=? AND operation_id=?",new String[]{user,id});
            if(pending(user).length()==0)write(user,"snapshot",new org.json.JSONObject().put("workspace",workspace).put("pending",new org.json.JSONArray()).toString());
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    synchronized void error(String user,String id,String message){ContentValues row=new ContentValues();row.put("error",message);getWritableDatabase().update("pending_operations",row,"user_id=? AND operation_id=?",new String[]{user,id});}
    synchronized void discardPending(String user){getWritableDatabase().delete("pending_operations","user_id=?",new String[]{user});}
    synchronized void clear(String userId) { SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{db.delete("cache", "user_id=?", new String[]{userId});db.delete("pending_operations","user_id=?",new String[]{userId});db.delete("operation_receipts","user_id=?",new String[]{userId});db.setTransactionSuccessful();}finally{db.endTransaction();} }
}
