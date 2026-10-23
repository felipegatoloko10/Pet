package app.pingo.mobile;

import android.app.*;
import android.os.*;
import android.widget.Toast;
import org.json.JSONObject;

/** User-initiated notification action; protected by the device lock, never receives a session token. */
public final class TaskActionActivity extends Activity {
    private boolean requested,executed;
    @Override protected void onCreate(Bundle saved){super.onCreate(saved);getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);runAfterUnlock();}
    @Override protected void onResume(){super.onResume();if(!requested)runAfterUnlock();}
    private void runAfterUnlock(){
        if(executed)return;
        KeyguardManager keyguard=getSystemService(KeyguardManager.class);
        if(keyguard.isDeviceLocked()){
            if(requested)return;requested=true;
            if(Build.VERSION.SDK_INT>=26)keyguard.requestDismissKeyguard(this,new KeyguardManager.KeyguardDismissCallback(){@Override public void onDismissSucceeded(){requested=false;runAfterUnlock();}@Override public void onDismissCancelled(){finish();}@Override public void onDismissError(){finish();}});
            else {android.content.Intent unlock=keyguard.createConfirmDeviceCredentialIntent("Pingo","Desbloqueie para alterar a tarefa");if(unlock!=null)startActivityForResult(unlock,10);else finish();}
            return;
        }
        executed=true;
        try{TaskActions.enqueue(this,new JSONObject(getIntent().getStringExtra("payload")),getIntent().getStringExtra("taskAction"));Toast.makeText(this,"Alteração guardada no Pingo. Vou sincronizar com o Google.",Toast.LENGTH_LONG).show();}catch(Exception ignored){Toast.makeText(this,"A tarefa mudou. Abra o Pingo para revisar.",Toast.LENGTH_LONG).show();}
        finish();
    }
    @Override protected void onActivityResult(int r,int result,android.content.Intent data){super.onActivityResult(r,result,data);requested=false;if(result==RESULT_OK)runAfterUnlock();else finish();}
}
