package app.pingo.mobile;
import static org.junit.Assert.*;
import android.content.Context;
import android.database.sqlite.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class DatabaseMigrationTest {
    @Test public void versionOneRetainsSnapshotAndMovesExistingQueueToVersionTwo() throws Exception {
        Context c=RuntimeEnvironment.getApplication();
        SQLiteOpenHelper old=new SQLiteOpenHelper(c,"pingo-mobile.db",null,1){public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE cache(user_id TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,PRIMARY KEY(user_id,k))");db.execSQL("CREATE TABLE reminders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL)");db.execSQL("CREATE TABLE deliveries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,at INTEGER NOT NULL)");}public void onUpgrade(SQLiteDatabase db,int a,int b){}};
        String snapshot=new JSONObject().put("workspace",new JSONObject().put("revision",7)).put("pending",new JSONArray().put(new JSONObject().put("operation",new JSONObject().put("operationId","preserved").put("command",new JSONObject().put("type","pet.care").put("action","pet"))))).toString();
        old.getWritableDatabase().execSQL("INSERT INTO cache(user_id,k,v) VALUES(?,?,?)",new Object[]{"alice","snapshot",snapshot});old.close();
        PingoDatabase migrated=PingoDatabase.get(c);JSONObject value=new JSONObject(migrated.read("alice","snapshot"));
        assertEquals(7,value.getJSONObject("workspace").getInt("revision"));assertEquals("preserved",value.getJSONArray("pending").getJSONObject(0).getJSONObject("operation").getString("operationId"));assertEquals(3,migrated.getReadableDatabase().getVersion());
    }
}
