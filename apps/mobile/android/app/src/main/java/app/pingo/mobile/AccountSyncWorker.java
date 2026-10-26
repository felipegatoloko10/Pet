package app.pingo.mobile;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.*;

/** Best-effort account sync without Google messaging. Android decides background timing. */
public final class AccountSyncWorker extends Worker {
    public AccountSyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    static void bind(Context c,String user){
        WorkManager manager=WorkManager.getInstance(c);
        if(user.startsWith("local:")||user.equals("demo")){manager.cancelUniqueWork("pingo-account-sync");return;}
        manager.enqueueUniquePeriodicWork("pingo-account-sync",ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(AccountSyncWorker.class,15,TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());
    }
    static boolean accept(Context c,String user,String before,JSONObject result)throws Exception{
        PingoDatabase db=PingoDatabase.get(c);
        synchronized(NotificationCoordinator.LOCK){ synchronized(db){
            if(!user.equals(NotificationCoordinator.prefs(c).getString("userId",""))||db.pending(user).length()!=0)return false;
            if(!java.util.Objects.equals(before,db.read(user,"snapshot")))return false;
            JSONObject workspace=result.getJSONObject("workspace"),plan=result.getJSONObject("plan");
            if(!user.equals(plan.getString("userId")))return false;
            db.write(user,"snapshot",new JSONObject().put("workspace",workspace).put("serverRevision",workspace.optLong("revision")).put("pending",new JSONArray()).toString());
            NotificationCoordinator.replace(c,user,plan,plan.getJSONArray("reminders"));
            NotificationCoordinator.prefs(c).edit().putString("cloudPlanDay",result.getString("day")).commit();
            return true;
        }}
    }
    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();String user=NotificationCoordinator.prefs(c).getString("userId","");
        if(user.isEmpty()||user.startsWith("local:")||user.equals("demo"))return Result.success();
        try{
            String token=new SecureStore(c).get("session");if(token==null||token.isEmpty())return Result.success();
            OperationWorker.flush(c,user);
            PingoDatabase db=PingoDatabase.get(c);String before=db.read(user,"snapshot");
            if(before==null||db.pending(user).length()!=0)return Result.success();
            JSONObject saved=new JSONObject(before).getJSONObject("workspace");
            String day=NotificationCoordinator.prefs(c).getString("cloudPlanDay","");
            URL url=new URL("https://pingo-gilt.vercel.app/api/v1/mobile/snapshot?revision="+saved.optLong("revision",-1)+"&day="+URLEncoder.encode(day,"UTF-8"));
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            connection.setConnectTimeout(10000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("X-Pingo-Account",user);
            try{
                int status=connection.getResponseCode();if(status==401||status==403)return Result.success();if(status!=200)return Result.retry();
                java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
                try(java.io.InputStream in=connection.getInputStream()){byte[] chunk=new byte[8192];int total=0,n;while((n=in.read(chunk))!=-1){total+=n;if(total>12000000)throw new Exception("size");bytes.write(chunk,0,n);}}
                JSONObject result=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                if(!result.optBoolean("unchanged"))accept(c,user,before,result);
                return Result.success();
            }finally{connection.disconnect();}
        }catch(Exception ignored){return Result.retry();}
    }
}
