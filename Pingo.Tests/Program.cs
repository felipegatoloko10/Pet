using System.Net;
using System.Text;
using System.Text.Json;
using Pingo.Core;

int passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception("FAIL: " + name); Console.WriteLine("PASS: " + name); passed++; }
var now = new DateTimeOffset(2026, 10, 21, 8, 0, 0, TimeSpan.FromHours(-3));
var state = new State();
var meeting = new Appointment("a", "Reunião", now.AddMinutes(30), now.AddMinutes(90));
var first = Routine.Due(state, [meeting], now, "Resumo");
Check(first.Count == 2 && first.Any(n => n.Key.StartsWith("brief:")), "Resumo às 8h e lembrete na janela de 30 min");
Check(Routine.Due(state, [meeting], now.AddSeconds(20), "Resumo").Count == 0, "Alertas não se repetem no próximo ciclo");
Check(Routine.Due(state, [meeting with { Start = now.AddMinutes(40) }], now.AddMinutes(10), "Resumo").Count == 1, "Compromisso reagendado recebe um novo lembrete");
Check(Routine.Due(new(), [meeting], now.AddMinutes(5), "Resumo").Any(n => n.Body.Contains("Reunião")), "Retomada do computador dentro da janela recupera lembrete");
Check(!Routine.Due(new(), [meeting], now.AddHours(1), "Resumo").Any(n => n.Key.StartsWith("event:")), "Compromissos já iniciados não geram alertas atrasados");
var paused = new State(); paused.Settings.Paused = true;
Check(Routine.Due(paused, [meeting], now, "Resumo").Count == 0 && paused.Delivered.Count == 0, "Pausa não consome lembretes");
Check(!Routine.Due(new(), [meeting with { AllDay = true }], now, "Resumo").Any(n => n.Key.StartsWith("event:")), "Eventos de dia inteiro não recebem aviso artificial à meia-noite");
Check(Routine.Due(state, [], now.AddDays(1), "Resumo").Count == 1, "Novo dia recebe novo resumo");
var before = new DateTimeOffset(2026, 10, 21, 7, 59, 0, now.Offset);
Check(Routine.Due(new(), [], before, "Resumo").Count == 0, "Não antecipa resumo antes do horário configurado");
Todo[] tasks = [new("1", "Atrasada", new(2026, 10, 20)), new("2", "Hoje", new(2026, 10, 21)), new("3", "Amanhã", new(2026, 10, 22)), new("4", "Concluída", new(2026, 10, 21), true), new("5", "Sem prazo", null)];
Check(Routine.TodayTasks(tasks, new(2026, 10, 21)).Count == 3, "Resumo inclui atrasadas e sem prazo; exclui futuras e concluídas");
Check(Commands.Parse("agendar dentista amanhã às 15h", now) is { Kind: CommandKind.Event, Title: "dentista", When.Hour: 15, When.Day: 22 }, "Comando em português preenche data e horário corretos");
Check(Commands.Parse("agendar reunião 23/10/2026 às 09:30", now).When?.Minute == 30, "Comando aceita data explícita e minutos");
Check(Commands.Parse("agendar reunião hoje às 29h", now).Kind == CommandKind.Help, "Horário inválido é rejeitado");
Check(Commands.Parse("tarefa pagar conta", now).Title == "pagar conta", "Comando cria tarefa sem interpretar instruções arbitrárias");
Check(GoogleClient.ParseQuery("/?code=a%2Bb&state=abc")["code"] == "a+b", "Callback OAuth decodifica URL corretamente");
Check(!GoogleClient.Base64Url([0xff, 0xee, 0xdd]).Contains('='), "PKCE usa base64url sem padding");
var eventJson = JsonDocument.Parse("""{"id":"holiday","summary":"Feriado","start":{"date":"2026-10-21"},"end":{"date":"2026-10-22"}}""");
Check(GoogleClient.ParseEvent(eventJson.RootElement) is { AllDay: true, Start.Day: 21, End.Day: 22 }, "Google Agenda preserva dia inteiro e fim exclusivo");
string folder = Path.Combine(Path.GetTempPath(), "pingo-test-" + Guid.NewGuid().ToString("N"));
var store = new StateStore(folder); store.Save(state); var reloaded = store.Load();
Check(reloaded.Delivered.SetEquals(state.Delivered), "Persistência mantém deduplicação após reinício");
File.WriteAllText(Path.Combine(folder, "state.json"), "invalid json");
bool preserved = false; try { store.Load(); } catch (InvalidDataException) { preserved = File.ReadAllText(Path.Combine(folder, "state.json")) == "invalid json"; }
Check(preserved, "Dados corrompidos são preservados, sem substituição silenciosa");

// Exercise the real API orchestration against an HTTP handler: pagination, partial outages and writes.
var handler = new FakeGoogle();
var secrets = new MemorySecrets { Json = JsonSerializer.Serialize(new GoogleCredentials { ClientId = "test.apps.googleusercontent.com", AccessToken = "test-token", RefreshToken = "test-refresh", Expires = DateTimeOffset.UtcNow.AddHours(1) }) };
var google = new GoogleClient(new HttpClient(handler), secrets);
var snapshot = await google.SyncAsync(now);
Check(snapshot.Events?.Count == 2, "Google Agenda lê todas as páginas");
Check(snapshot.Tasks?.Single().Due == new DateOnly(2026, 10, 21), "Vencimento UTC do Tasks não vira o dia anterior no Brasil");
Check(snapshot.Mail?.Single().Subject == "Olá Pingo" && snapshot.Unread == 7 && snapshot.Email == "teste@example.com", "Gmail usa contagem da caixa de entrada e cabeçalhos reais");
Check(handler.Urls.All(u => !u.Contains("q=") && !u.Contains("format=full")), "Gmail metadata não usa consulta proibida nem lê corpo");
var created = await google.CreateEventAsync("Dentista", now.AddDays(1), now.AddDays(1).AddHours(1), 30, "0123456789abcdef");
Check(created.Title == "Dentista" && handler.EventBody!.Contains("\"minutes\":30") && handler.EventBody.Contains("0123456789abcdef"), "Criação de evento envia ID estável e lembrete de 30 min");
handler.EventConflict = true;
var retried = await google.CreateEventAsync("Dentista", now.AddDays(1), now.AddDays(1).AddHours(1), 30, "0123456789abcdef");
Check(retried.Id == "0123456789abcdef", "Nova tentativa de evento já criado recupera o original, sem duplicar");
handler.EventConflict = false;
await google.CompleteTaskAsync(snapshot.Tasks!.Single());
Check(handler.Completed, "Concluir tarefa Google usa PATCH de status");
handler.TasksForbidden = true; var partial = await google.SyncAsync(now);
Check(partial.Tasks is null && partial.Events?.Count == 2 && partial.Mail?.Count == 1 && partial.Errors.Single().StartsWith("Tarefas:"), "Falha no Tasks não interrompe Agenda e Gmail");
google.Disconnect(); Check(!google.Connected && JsonSerializer.Deserialize<GoogleCredentials>(secrets.Json!) is { AccessToken.Length: 0, RefreshToken.Length: 0 }, "Desconexao remove tokens de usuario da autorizacao local");
handler.TasksForbidden = false;
var authSecrets = new MemorySecrets();
var appConfiguration = GoogleOAuthConfiguration.Parse("""{"installed":{"client_id":"test.apps.googleusercontent.com","client_secret":"desktop-client-secret"}}""");
var authGoogle = new GoogleClient(new HttpClient(handler), authSecrets, appConfiguration);
Check(authGoogle.Configured && !authGoogle.Connected && authSecrets.Json is null, "Cliente integrado habilita o botao sem importar JSON ou criar autorizacao falsa");
Task? browserCallback = null; string? challenge = null;
Action<string> authorizeInBrowser = url =>
{
    var query = GoogleClient.ParseQuery(url);
    challenge = query["code_challenge"];
    Check(query["code_challenge_method"] == "S256" && query["access_type"] == "offline" && query["redirect_uri"].StartsWith("http://127.0.0.1:"), "Login usa PKCE S256 e callback apenas no loopback");
    browserCallback = Task.Run(async () =>
    {
        using var callbackHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        using var wrongState = await callbackHttp.GetAsync(query["redirect_uri"] + "?code=bad&state=incorrect");
        Check(wrongState.StatusCode == HttpStatusCode.BadRequest, "OAuth rejeita callback com state incorreto");
        using var correct = await callbackHttp.GetAsync(query["redirect_uri"] + "?code=auth-code&state=" + Uri.EscapeDataString(query["state"]));
        Check(correct.IsSuccessStatusCode, "Callback OAuth válido conclui a autorização local");
    });
};
await authGoogle.ConnectAsync(authorizeInBrowser);
await browserCallback!;
Check(authGoogle.Connected && authSecrets.Json!.Contains("test-refresh"), "Autorização persiste o refresh token no armazenamento protegido");
var exchanged = GoogleClient.ParseQuery(handler.TokenBody!);
Check(GoogleClient.Base64Url(System.Security.Cryptography.SHA256.HashData(Encoding.ASCII.GetBytes(exchanged["code_verifier"]))) == challenge, "Verificador enviado ao token endpoint corresponde ao desafio PKCE");
Check(exchanged["client_secret"] == "desktop-client-secret" && exchanged["grant_type"] == "authorization_code" && exchanged["client_id"] == appConfiguration.ClientId, "Troca de codigo usa a configuracao Desktop integrada");
var expiredSecrets = new MemorySecrets { Json = JsonSerializer.Serialize(new GoogleCredentials { ClientId = "test.apps.googleusercontent.com", RefreshToken = "old-refresh", Expires = DateTimeOffset.UtcNow.AddHours(-1) }) };
var expiredGoogle = new GoogleClient(new HttpClient(handler), expiredSecrets);
await expiredGoogle.SyncAsync(now);
Check(GoogleClient.ParseQuery(handler.TokenBody!)["grant_type"] == "refresh_token", "Sincronização renova token expirado sem novo login");
Check(handler.Urls.Count(u => u.Contains("/messages/mail1?")) == 2, "Cabeçalhos de mensagens já conhecidas são reutilizados entre sincronizações");
authGoogle.Disconnect();
Check(authGoogle.Configured && !authGoogle.Connected && authSecrets.Json is null, "Desconectar apaga tokens, mas conserva o cliente integrado para novo login");
await authGoogle.ConnectAsync(authorizeInBrowser); await browserCallback!;
Check(authGoogle.Connected, "Usuario pode reconectar pelo mesmo botao sem importar arquivo");
var restoredGoogle = new GoogleClient(new HttpClient(handler), authSecrets, appConfiguration);
Check(restoredGoogle.Connected, "Reiniciar preserva autorizacao vinculada ao mesmo cliente integrado");
var changedGoogle = new GoogleClient(new HttpClient(handler), authSecrets, new("different.apps.googleusercontent.com", "different-secret"));
Check(changedGoogle.Configured && !changedGoogle.Connected, "Troca de projeto nao reaproveita tokens emitidos para outro cliente OAuth");
var legacyGoogle = new GoogleClient(new HttpClient(handler), authSecrets);
Check(legacyGoogle.Configured && legacyGoogle.Connected, "Conexoes existentes continuam funcionando sem configuracao integrada");
legacyGoogle.Disconnect();
var restartedLegacy = new GoogleClient(new HttpClient(handler), authSecrets);
Check(restartedLegacy.Configured && !restartedLegacy.Connected, "Instalacao antiga mantem apenas a identidade do aplicativo e permite novo login apos desconectar e reiniciar");
var unconfigured = new GoogleClient(new HttpClient(handler), new MemorySecrets());
bool browserOpened = false, unavailable = false;
try { await unconfigured.ConnectAsync(_ => browserOpened = true); } catch (InvalidOperationException ex) { unavailable = ex.Message.Contains("ainda não foi habilitado"); }
Check(!browserOpened && unavailable && !unconfigured.Configured, "Sem cliente real, nao abre login quebrado e informa a configuracao pendente");
Check(GoogleOAuthConfiguration.Parse("""{"client_id":"valid-client.apps.googleusercontent.com"}""").ClientSecret == "", "Configuracao Desktop aceita identificador publico sem segredo opcional");
string[] invalidConfigurations = [
    "{", "null", "[]", "{}", """{"client_id":""}""", """{"client_id":"https://attacker.example"}""",
    """{"web":{"client_id":"test.apps.googleusercontent.com"}}""", """{"installed":null}""",
    """{"client_id":"test.apps.googleusercontent.com","client_secret":123}""",
    """{"client_id":"test.apps.googleusercontent.com","access_token":"user-token"}""",
    """{"refresh_token":"user-token","installed":{"client_id":"test.apps.googleusercontent.com"}}""",
    """{"installed":{"client_id":"test.apps.googleusercontent.com","RefreshToken":"user-token"}}"""
];
Check(invalidConfigurations.All(json => { try { GoogleOAuthConfiguration.Parse(json); return false; } catch (InvalidDataException) { return true; } }), "Configuracao rejeita JSON invalido, clientes Web, identificadores invalidos e tokens de usuario");
var importedGoogle = new GoogleClient(new HttpClient(handler), new MemorySecrets());
importedGoogle.ImportCredentials("""{"installed":{"client_id":"legacy.apps.googleusercontent.com"}}""");
Check(importedGoogle.Configured && !importedGoogle.Connected, "Leitura da configuracao legada continua compativel");
Console.WriteLine($"\n{passed} verificações passaram.");

sealed class MemorySecrets : ISecretStore
{
    public string? Json;
    public string? Read() => Json;
    public void Write(string json) => Json = json;
    public void Clear() => Json = null;
}
sealed class FakeGoogle : HttpMessageHandler
{
    public readonly List<string> Urls = [];
    public string? EventBody; public string? TokenBody; public bool Completed; public bool TasksForbidden; public bool EventConflict;
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!.ToString(); Urls.Add(url);
        if (url.Contains("oauth2.googleapis.com/token"))
        {
            TokenBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new(HttpStatusCode.OK) { Content = new StringContent("""{"access_token":"test-token","refresh_token":"test-refresh","expires_in":3600}""", Encoding.UTF8, "application/json") };
        }
        if (request.Headers.Authorization?.Parameter != "test-token") throw new Exception("Missing bearer token");
        string json;
        if (url.Contains("/calendar/") && request.Method == HttpMethod.Post)
        {
            EventBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            if (EventConflict) return new(HttpStatusCode.Conflict);
            using var doc = JsonDocument.Parse(EventBody); var root = doc.RootElement;
            json = JsonSerializer.Serialize(new { id = root.GetProperty("id").GetString(), summary = root.GetProperty("summary").GetString(), start = root.GetProperty("start"), end = root.GetProperty("end") });
        }
        else if (url.Contains("/events/0123456789abcdef"))
        {
            using var doc = JsonDocument.Parse(EventBody!); var root = doc.RootElement;
            json = JsonSerializer.Serialize(new { id = root.GetProperty("id").GetString(), summary = root.GetProperty("summary").GetString(), start = root.GetProperty("start"), end = root.GetProperty("end") });
        }
        else if (url.Contains("/calendar/"))
            json = url.Contains("pageToken=") ? """{"items":[{"id":"two","summary":"Segunda","start":{"dateTime":"2026-10-21T14:00:00-03:00"},"end":{"dateTime":"2026-10-21T15:00:00-03:00"}}]}""" : """{"nextPageToken":"p2","items":[{"id":"one","summary":"Primeira","start":{"dateTime":"2026-10-21T10:00:00-03:00"},"end":{"dateTime":"2026-10-21T11:00:00-03:00"}}]}""";
        else if (url.Contains("tasks.googleapis.com") && TasksForbidden) return new(HttpStatusCode.Forbidden);
        else if (request.Method == HttpMethod.Patch) { Completed = (await request.Content!.ReadAsStringAsync(cancellationToken)).Contains("completed"); json = "{}"; }
        else if (url.Contains("users/@me/lists")) json = """{"items":[{"id":"list1","title":"Pessoal"}]}""";
        else if (url.Contains("tasks.googleapis.com")) json = """{"items":[{"id":"task1","title":"Pagar conta","status":"needsAction","due":"2026-10-21T00:00:00.000Z"}]}""";
        else if (url.EndsWith("/labels/INBOX")) json = """{"messagesUnread":7}""";
        else if (url.EndsWith("/profile")) json = """{"emailAddress":"teste@example.com"}""";
        else if (url.Contains("/messages/mail1?")) json = """{"internalDate":"1792580400000","payload":{"headers":[{"name":"Subject","value":"Olá Pingo"},{"name":"From","value":"Pessoa <pessoa@example.com>"}]}}""";
        else if (url.Contains("/messages?")) json = """{"messages":[{"id":"mail1"}]}""";
        else throw new Exception("Unexpected request: " + url);
        return new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}
