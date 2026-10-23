package app.pingo.mobile;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
public final class PingoMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        JSONObject n = new JSONObject(message.getData());
        NotificationCoordinator.deliver(this, n);
    }
    @Override public void onNewToken(String token) { TokenRegistrationWorker.enqueue(this); }
}
