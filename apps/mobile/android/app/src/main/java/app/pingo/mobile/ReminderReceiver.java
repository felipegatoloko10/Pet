package app.pingo.mobile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("noticeId"); if (id != null) NotificationCoordinator.fireLocal(context, id);
    }
}
