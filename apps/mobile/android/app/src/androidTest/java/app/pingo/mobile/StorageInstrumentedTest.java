package app.pingo.mobile;
import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class StorageInstrumentedTest {
    @Test public void sessionAndLoginAttemptSurviveStoreRecreation() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureStore a = new SecureStore(c);
        a.put("instrumentation", "fake-test-session");
        assertEquals("fake-test-session", new SecureStore(c).get("instrumentation"));
        assertFalse(c.getSharedPreferences("pingo-secure", 0).getString("instrumentation", "").contains("fake-test-session"));
        a.put("instrumentation", null);
        assertNull(new SecureStore(c).get("instrumentation"));
    }
    @Test public void offlineQueueSurvivesDatabaseReopenAndKeepsAccountsSeparate() {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PingoDatabase db = PingoDatabase.get(c);
        db.write("instrumentation-alice", "snapshot", "{\"pending\":[{\"operationId\":\"stable-test-id\"}]}");
        db.close();
        assertTrue(PingoDatabase.get(c).read("instrumentation-alice", "snapshot").contains("stable-test-id"));
        assertNull(PingoDatabase.get(c).read("instrumentation-bob", "snapshot"));
        db.clear("instrumentation-alice");
    }
    @Test public void oauthCallbackResolvesToPingoWithoutSessionInTheUri() {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent callback = new Intent(Intent.ACTION_VIEW, Uri.parse("app.pingo.mobile://auth/callback?id=test&state=test&code=temporary"));
        callback.setPackage("app.pingo.mobile");
        assertNotNull(c.getPackageManager().resolveActivity(callback, 0));
        Intent other = new Intent(Intent.ACTION_VIEW, Uri.parse("app.pingo.mobile://arbitrary/path")); other.setPackage("app.pingo.mobile");
        assertNull(c.getPackageManager().resolveActivity(other, 0));
    }
}
