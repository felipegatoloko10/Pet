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
    static void enqueue(Context c){WorkManager.getInstance(c).enqueueUniqueWork("pingo-operations",ExistingWorkPolicy.APPEND_OR_REPLACE,new OneTimeWorkRequest.Builder(OperationWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());}
    static String flush(Context c,String user)throws Exception{
        synchronized(SENDER){
            PingoDatabase store=PingoDatabase.get(c);
            for(int n=0;n<100;n++){
                if(!user.equals(NotificationCoordinator.prefs(c).getString("userId","")))break;
                JSONArray queue=store.pending(user);if(queue.length()==0)break;
                JSONObject entry=queue.getJSONObject(0);if(entry.has("error"))break;
                JSONObject op=entry.getJSONObject("operation");
                String token=new SecureStore(c).get("session");if(token==null)break;
                HttpURLConnection connection=(HttpURLConnection)new URL("https://pingo-gilt.vercel.app/api/v1/operations").openConnection();
                connection.setRequestMethod("POST");connection.setConnectTimeout(10000);connection.setReadTimeout(65000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
                try{
                    try(java.io.OutputStream out=connection.getOutputStream()){out.write(op.toString().getBytes(StandardCharsets.UTF_8));}
                    int status=connection.getResponseCode();
                    if(status>=500||status==429)break;
                    if(status!=200){store.error(user,op.getString("operationId"),status==401?"Sua sessão expirou. Entre novamente com Google.":"O item mudou. Abra o Pingo para revisar esta alteração.");break;}
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
    @NonNull @Override public Result doWork(){try{String user=NotificationCoordinator.prefs(getApplicationContext()).getString("userId","");if(user.isEmpty())return Result.success();flush(getApplicationContext(),user);JSONArray queue=PingoDatabase.get(getApplicationContext()).pending(user);return queue.length()>0&&!queue.getJSONObject(0).has("error")?Result.retry():Result.success();}catch(Exception ignored){return Result.retry();}}
}
