package app.pingo.mobile;
import static org.junit.Assert.*;
import android.app.*;
import android.content.Context;
import android.os.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class TaskActionInstrumentedTest {
    private JSONObject snapshot(Context c,String user)throws Exception{return new JSONObject(PingoDatabase.get(c).read(user,"snapshot"));}
    private void waitFor(Context c,String user,boolean complete)throws Exception{
        for(int i=0;i<50;i++){JSONObject t=snapshot(c,user).getJSONObject("workspace").getJSONArray("tasks").getJSONObject(0);if(complete?t.optBoolean("completed"):"active".equals(t.optString("columnId")))return;SystemClock.sleep(200);}fail("O botão da notificação não atualizou a tarefa.");
    }
    private void capture(Context c,String file)throws Exception{
        SystemClock.sleep(1200);
        try(android.os.ParcelFileDescriptor command=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cmd statusbar expand-notifications");java.io.FileInputStream output=new java.io.FileInputStream(command.getFileDescriptor())){output.readAllBytes();}
        SystemClock.sleep(1800);
        android.view.accessibility.AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
        collapse(root);SystemClock.sleep(600);
        android.graphics.Bitmap b=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(c.getExternalFilesDir(null),file))){b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
        try(android.os.ParcelFileDescriptor command=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cp "+new java.io.File(c.getExternalFilesDir(null),file).getAbsolutePath()+" /data/local/tmp/"+file);java.io.FileInputStream output=new java.io.FileInputStream(command.getFileDescriptor())){output.readAllBytes();}
        try(android.os.ParcelFileDescriptor command=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cmd statusbar collapse");java.io.FileInputStream output=new java.io.FileInputStream(command.getFileDescriptor())){output.readAllBytes();}
        SystemClock.sleep(700);
    }
    private boolean collapse(android.view.accessibility.AccessibilityNodeInfo node){
        if(node==null)return false;
        CharSequence desc=node.getContentDescription();
        if(desc!=null&&desc.toString().toLowerCase(java.util.Locale.ROOT).contains("collapse")){node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);return true;}
        for(int i=0;i<node.getChildCount();i++)if(collapse(node.getChild(i)))return true;
        return false;
    }
    @Test public void buttonsWorkWithNoWebViewOfflineAndSurviveReopen()throws Exception{
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();String user="instrumentation-checkin";
        assertNull("Este teste exige emulador sem sessão real.",new SecureStore(c).get("session"));
        if(Build.VERSION.SDK_INT>=33){InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant app.pingo.mobile android.permission.POST_NOTIFICATIONS").close();SystemClock.sleep(300);}
        NotificationCoordinator.clear(c);NotificationCoordinator.prefs(c).edit().putString("userId",user).putBoolean("enabled",true).commit();
        try{
            String start=TaskActions.iso(System.currentTimeMillis()-60000),end=TaskActions.iso(System.currentTimeMillis()+1800000),key=start+"|"+end;
            JSONObject t=new JSONObject().put("id","task").put("title","Teste de tarefa do Pingo").put("boardId","b").put("columnId","todo").put("revision",1).put("completed",false).put("scheduledStart",start).put("scheduledEnd",end);
            JSONArray cols=new JSONArray().put(new JSONObject().put("id","todo").put("kind","todo")).put(new JSONObject().put("id","active").put("kind","active")).put(new JSONObject().put("id","done").put("kind","done"));
            JSONObject w=new JSONObject().put("tasks",new JSONArray().put(t)).put("boards",new JSONArray().put(new JSONObject().put("id","b").put("columns",cols))).put("preferences",new JSONObject().put("taskCheckIns",true));
            PingoDatabase.get(c).write(user,"snapshot",new JSONObject().put("workspace",w).put("pending",new JSONArray()).toString());
            JSONObject n=new JSONObject().put("noticeId","native:start").put("userId",user).put("taskId","task").put("phase","start").put("scheduleKey",key).put("title","Teste de tarefa do Pingo").put("body","É hora de começar. Vamos juntos?").put("expiresAt",System.currentTimeMillis()+600000);
            NotificationCoordinator.deliver(c,n);capture(c,"v24-start-notification.png");
            Notification notice=c.getSystemService(NotificationManager.class).getActiveNotifications()[0].getNotification();assertEquals(3,notice.actions.length);notice.actions[0].actionIntent.send();
            waitFor(c,user,false);assertEquals(start,snapshot(c,user).getJSONObject("workspace").getJSONArray("tasks").getJSONObject(0).getString("scheduledStart"));
            PingoDatabase.get(c).close();assertEquals(1,snapshot(c,user).getJSONArray("pending").length());
            n.put("phase","end").put("noticeId","native:end").put("body","Deu tempo de concluir? Está tudo no seu ritmo.");NotificationCoordinator.deliver(c,n);capture(c,"v24-end-notification.png");
            notice=c.getSystemService(NotificationManager.class).getActiveNotifications()[0].getNotification();assertEquals("Concluir",notice.actions[0].title.toString());
            android.view.View compact=notice.contentView.apply(c,new android.widget.FrameLayout(c));
            assertEquals(android.view.View.VISIBLE,compact.findViewById(R.id.status_complete).getVisibility());
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->compact.findViewById(R.id.status_complete).performClick());waitFor(c,user,true);
            assertEquals(2,snapshot(c,user).getJSONArray("pending").length());
            NotificationCoordinator.deliver(c,n.put("noticeId","late:end"));assertEquals(0,c.getSystemService(NotificationManager.class).getActiveNotifications().length);
        }finally{NotificationCoordinator.clear(c);PingoDatabase.get(c).clear(user);androidx.work.WorkManager.getInstance(c).cancelUniqueWork("pingo-operations");}
    }
}
