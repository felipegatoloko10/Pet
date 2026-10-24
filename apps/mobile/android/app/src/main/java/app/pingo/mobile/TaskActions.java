package app.pingo.mobile;

import android.content.Context;
import android.database.Cursor;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

final class TaskActions {
    static String iso(long time){SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date(time));}
    static String text(JSONObject o,String key){return o.isNull(key)?"":o.optString(key,"");}
    static JSONObject task(JSONObject workspace,String id){JSONArray tasks=workspace.optJSONArray("tasks");if(tasks!=null)for(int i=0;i<tasks.length();i++){JSONObject t=tasks.optJSONObject(i);if(t!=null&&id.equals(t.optString("id")))return t;}return null;}
    static String canonical(String value){
        try{String v=value.replaceFirst("(\\.\\d{3})\\d+", "$1");String[] patterns={"yyyy-MM-dd'T'HH:mm:ss.SSSXXX","yyyy-MM-dd'T'HH:mm:ssXXX"};for(String pattern:patterns)try{SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.ROOT);f.setLenient(false);return iso(f.parse(v).getTime());}catch(Exception ignored){}}catch(Exception ignored){}return value;
    }
    static String scheduleKey(JSONObject t){return canonical(text(t,"scheduledStart"))+"|"+canonical(text(t,"scheduledEnd"));}
    static String canonicalKey(String key){String[] parts=key.split("\\|",-1);return parts.length==2?canonical(parts[0])+"|"+canonical(parts[1]):key;}
    static boolean hasWaiting(Context c,String user,String id){try{String saved=PingoDatabase.get(c).read(user,"snapshot");if(saved==null)return true;JSONObject w=new JSONObject(saved).getJSONObject("workspace"),t=task(w,id);if(t==null)return true;JSONArray boards=w.getJSONArray("boards");for(int i=0;i<boards.length();i++){JSONObject b=boards.getJSONObject(i);if(b.getString("id").equals(t.getString("boardId"))){JSONArray cols=b.getJSONArray("columns");for(int j=0;j<cols.length();j++)if("waiting".equals(cols.getJSONObject(j).getString("kind")))return true;}}return false;}catch(Exception e){return false;}}
    static boolean valid(Context c,JSONObject n){return valid(c,n,false);}
    static boolean valid(Context c,JSONObject n,boolean forAction){
        if(!n.has("taskId")||n.optString("taskId").isEmpty())return true;
        try{
            String saved=PingoDatabase.get(c).read(n.getString("userId"),"snapshot");if(saved==null)return true;
            JSONObject w=new JSONObject(saved).getJSONObject("workspace"),t=task(w,n.getString("taskId"));
            if(w.optJSONObject("preferences")!=null&&!w.getJSONObject("preferences").optBoolean("taskCheckIns",true))return false;
            if(t==null)return true;
            if(t.optBoolean("completed")||t.optBoolean("deleted")||t.optBoolean("calendarSuppressed")||!text(t,"archivedAt").isEmpty())return false;
            if(!canonicalKey(n.optString("scheduleKey")).equals(scheduleKey(t)))return false;
            JSONObject check=t.optJSONObject("checkIn");String phase=n.optString("phase");
            if(check!=null&&check.optBoolean("endAnswered")&&(phase.equals("end")||phase.equals("repeat")))return false;
            if(!forAction&&!text(t,"actualStartedAt").isEmpty()&&(phase.equals("before")||phase.equals("start")))return false;
            return true;
        }catch(Exception ignored){return false;}
    }
    static void enqueue(Context c,JSONObject n,String action)throws Exception{
        String user=n.getString("userId"),id=n.getString("taskId"),opId=n.getString("operationId");
        if(!user.equals(NotificationCoordinator.prefs(c).getString("userId",""))||n.optLong("expiresAt")<=System.currentTimeMillis()||!valid(c,n,true))throw new Exception("A tarefa mudou. Abra o Pingo para revisar.");
        if(action.equals("waiting")&&!hasWaiting(c,user,id))throw new Exception("A coluna Aguardando foi removida. Abra o Pingo para escolher outra etapa.");
        if(!Arrays.asList("start","complete","snooze","pending","waiting").contains(action))throw new Exception("Ação inválida");
        PingoDatabase store=PingoDatabase.get(c);
        synchronized(store){
            android.database.sqlite.SQLiteDatabase db=store.getWritableDatabase();db.beginTransaction();
            try{
                try(Cursor seen=db.rawQuery("SELECT 1 FROM operation_receipts WHERE user_id=? AND operation_id=? UNION ALL SELECT 1 FROM pending_operations WHERE user_id=? AND operation_id=?",new String[]{user,opId,user,opId})){if(seen.moveToFirst())return;}
                String raw=store.read(user,"snapshot");JSONObject snapshot=raw==null?new JSONObject().put("workspace",new JSONObject()):new JSONObject(raw),w=snapshot.getJSONObject("workspace"),t=task(w,id);
                int revision=t==null?n.optInt("taskRevision"):t.getInt("revision");String phase=n.getString("phase"),key=n.getString("scheduleKey");
                long actionTime=System.currentTimeMillis();
                JSONObject cmd=new JSONObject().put("type","task.checkIn").put("id",id).put("action",action).put("phase",phase).put("scheduleKey",key).put("expectedRevision",revision).put("actedAt",iso(actionTime));
                JSONObject op=new JSONObject().put("operationId",opId).put("command",cmd);
                if(t!=null){
                    JSONObject check=t.optJSONObject("checkIn");if(check==null||!key.equals(check.optString("key")))check=new JSONObject().put("key",key);
                    boolean end=phase.equals("end")||phase.equals("repeat")||(phase.equals("snooze")&&check.optString("snoozePhase").equals("end"));
                    if(end)check.put("endAnswered",true);
                    if(action.equals("snooze")){check.put("snoozeAt",iso(actionTime+(end?15:10)*60000));check.put("snoozePhase",end?"end":"start");}
                    else{
                        check.remove("snoozeAt");String kind=action.equals("complete")?"done":action.equals("pending")?"todo":action.equals("waiting")?"waiting":"active";
                        JSONArray boards=w.optJSONArray("boards");if(boards!=null)for(int i=0;i<boards.length();i++){JSONObject b=boards.getJSONObject(i);if(b.getString("id").equals(t.getString("boardId"))){JSONArray cols=b.getJSONArray("columns");for(int j=0;j<cols.length();j++){JSONObject col=cols.getJSONObject(j);if(kind.equals(col.getString("kind")))t.put("columnId",col.getString("id"));}}}
                        t.put("completed",action.equals("complete"));t.put("completedAt",action.equals("complete")?iso(actionTime):JSONObject.NULL);
                        if(action.equals("start"))t.put("actualStartedAt",iso(actionTime));else if(!action.equals("complete"))t.put("actualStartedAt",JSONObject.NULL);
                        t.put("syncState","pending");
                    }
                    t.put("checkIn",check).put("revision",revision+1);
                }
                JSONArray pending=snapshot.optJSONArray("pending");if(pending==null)pending=new JSONArray();pending.put(new JSONObject().put("operation",op));snapshot.put("pending",pending);
                store.write(user,"snapshot",snapshot.toString());db.setTransactionSuccessful();
            }finally{db.endTransaction();}
        }
        NotificationCoordinator.afterAction(c,n,action);
        OperationWorker.enqueue(c);
    }
}
