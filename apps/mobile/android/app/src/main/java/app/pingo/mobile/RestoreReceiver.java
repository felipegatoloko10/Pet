package app.pingo.mobile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class RestoreReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { NotificationCoordinator.restore(context); }
}
