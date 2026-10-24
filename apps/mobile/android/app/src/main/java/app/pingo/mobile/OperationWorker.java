package app.pingo.mobile;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** One queue and one sender for WebView operations and notification actions. */
public final class OperationWorker extends Worker {
    private static final Object SENDER=new Object();
    public OperationWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    static JSONObject nextEntry(JSONArray queue)throws JSONException{
        java.util.HashSet<String> blocked=new java.util.HashSet<>();
        for(int i=0;i<queue.length();i++){
            JSONObject entry=queue.getJSONObject(i),cmd=entry.getJSONObject("operation").getJSONObject("command");
            String id=cmd.optString("id","");if(cmd.optJSONObject("task")!=null)id=cmd.getJSONObject("task").optString("id","");if(cmd.optJSONObject("event")!=null)id=cmd.getJSONObject("event").optString("id","");
            if(!entry.has("error")&&(blocked.isEmpty()||(!blocked.contains("*")&&cmd.optString("type").equals("task.checkIn")&&!blocked.contains(id))))return entry;
            blocked.add(id.isEmpty()?"*":id);
        }return null;
    }
    static void enqueue(Context c){WorkManager.getInstance(c).enqueueUniqueWork("pingo-operations",ExistingWorkPolicy.APPEND_OR_REPLACE,new OneTimeWorkRequest.Builder(OperationWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());}
    static String flush(Context c,String user)throws Exception{
        synchronized(SENDER){
            PingoDatabase store=PingoDatabase.get(c);
            for(int n=0;n<100;n++){
                if(!user.equals(NotificationCoordinator.prefs(c).getString("userId","")))break;
                JSONArray queue=store.pending(user);if(queue.length()==0)break;
                JSONObject entry=nextEntry(queue);if(entry==null)break;
                JSONObject op=entry.getJSONObject("operation");
                String token=new SecureStore(c).get("session");if(token==null)break;
                HttpURLConnection connection=(HttpURLConnection)new URL("https://pingo-gilt.vercel.app/api/v1/operations").openConnection();
                connection.setRequestMethod("POST");connection.setConnectTimeout(10000);connection.setReadTimeout(65000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
                try{
                    try(java.io.OutputStream out=connection.getOutputStream()){out.write(op.toString().getBytes(StandardCharsets.UTF_8));}
                    int status=connection.getResponseCode();
                    if(status>=500||status==429)break;
                    if(status!=200){
                        String message=status==401?"Sua sessão expirou. Entre novamente com Google.":"O item mudou. Abra o Pingo para revisar esta alteração.";
                        store.error(user,op.getString("operationId"),message);
                        if(op.getJSONObject("command").optString("type").equals("task.checkIn")){
                            JSONObject snapshot=new JSONObject(store.read(user,"snapshot")),t=TaskActions.task(snapshot.getJSONObject("workspace"),op.getJSONObject("command").optString("id"));
                            JSONObject notice=new JSONObject().put("userId",user).put("noticeId","action-review:"+op.getString("operationId")).put("title",t==null?"Revise o status da tarefa":t.optString("title","Sua tarefa")).put("body",message).put("expiresAt",System.currentTimeMillis()+3600000);NotificationCoordinator.deliver(c,notice);
                        }
                        if(status==401)break;continue;
                    }
                    java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
                    try(java.io.InputStream in=connection.getInputStream()){byte[] b=new byte[8192];int total=0,r;while((r=in.read(b))!=-1){total+=r;if(total>12000000)throw new Exception("Resposta muito grande");bytes.write(b,0,r);}}
                    JSONObject result=new JSONObject(bytes.toString("UTF-8"));
                    if(!user.equals(NotificationCoordinator.prefs(c).getString("userId","")))break;
                    store.acknowledge(user,op.getString("operationId"),result.getJSONObject("workspace"));
                }finally{connection.disconnect();}
            }
            return store.read(user,"snapshot");
        }
    }
    @NonNull @Override public Result doWork(){try{String user=NotificationCoordinator.prefs(getApplicationContext()).getString("userId","");if(user.isEmpty())return Result.success();flush(getApplicationContext(),user);return nextEntry(PingoDatabase.get(getApplicationContext()).pending(user))!=null?Result.retry():Result.success();}catch(Exception ignored){return Result.retry();}}
}
