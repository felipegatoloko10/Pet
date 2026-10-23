package app.pingo.mobile;
import static org.junit.Assert.*;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MobileInterfaceInstrumentedTest {
    private String js(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        String[] value = new String[]{"null"}; CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, r -> { value[0] = r; latch.countDown(); }));
        assertTrue(latch.await(10, TimeUnit.SECONDS)); return value[0];
    }
    private void waitFor(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        for (int i=0;i<100;i++) { if ("true".equals(js(scenario,script))) return; SystemClock.sleep(200); }
        fail("A interface Android não atingiu o estado esperado.");
    }
    @Test public void demoCareUsesNativeStorageAndSurvivesActivityRestart() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario,"Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Explorar demonstração'))");
            js(scenario,"Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Explorar demonstração')).click()");
            waitFor(scenario,"!!document.querySelector('.mobile-app .home-board')");
            js(scenario,"document.querySelector('button[aria-label=\"Pingo\"]').click()");
            waitFor(scenario,"!!document.querySelector('progress[aria-label=\"Saciedade\"]')");
            js(scenario,"Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Alimentar').click()");
            waitFor(scenario,"document.querySelector('progress[aria-label=\"Saciedade\"]').value>99");
        }
        try (ActivityScenario<MainActivity> restarted = ActivityScenario.launch(MainActivity.class)) {
            waitFor(restarted,"Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Explorar demonstração'))");
            js(restarted,"Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Explorar demonstração')).click()");
            waitFor(restarted,"!!document.querySelector('.mobile-app')");
            js(restarted,"document.querySelector('button[aria-label=\"Pingo\"]').click()");
            waitFor(restarted,"document.querySelector('progress[aria-label=\"Saciedade\"]')?.value>99");
        }
    }
}
