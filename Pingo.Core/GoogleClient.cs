using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Pingo.Core;

public interface ISecretStore
{
    string? Read();
    void Write(string json);
    void Clear();
}
public sealed class GoogleCredentials
{
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string AccessToken { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public DateTimeOffset Expires { get; set; }
}
public sealed record GoogleSnapshot(List<Appointment>? Events, List<Todo>? Tasks, List<Mail>? Mail, int? Unread, string? Email, List<string> Errors);

public sealed class GoogleClient
{
    private readonly HttpClient http;
    private readonly ISecretStore secrets;
    private readonly GoogleOAuthConfiguration? applicationConfiguration;
    private GoogleCredentials? credentials;
    private readonly SemaphoreSlim tokenLock = new(1, 1);
    private readonly Dictionary<string, Mail> mailCache = new();
    private sealed class EventConflictException : Exception;
    private const string TokenUrl = "https://oauth2.googleapis.com/token";
    public bool Connected => credentials is { RefreshToken.Length: > 0 } || credentials is { AccessToken.Length: > 0 };
    public bool Configured => credentials is { ClientId.Length: > 0 };
    public GoogleClient(HttpClient http, ISecretStore secrets, GoogleOAuthConfiguration? applicationConfiguration = null)
    {
        this.http = http; this.secrets = secrets; this.applicationConfiguration = applicationConfiguration;
        var saved = Load(secrets);
        // A new app registration must not reuse refresh tokens issued to a different OAuth client.
        credentials = applicationConfiguration is null ? saved : saved?.ClientId == applicationConfiguration.ClientId
            ? new GoogleCredentials { ClientId = applicationConfiguration.ClientId, ClientSecret = applicationConfiguration.ClientSecret, AccessToken = saved.AccessToken, RefreshToken = saved.RefreshToken, Expires = saved.Expires }
            : applicationConfiguration.CreateCredentials();
    }
    private static GoogleCredentials? Load(ISecretStore store)
    {
        var json = store.Read();
        return json is null ? null : JsonSerializer.Deserialize<GoogleCredentials>(json);
    }
    public void ImportCredentials(string json)
    {
        var configuration = GoogleOAuthConfiguration.Parse(json);
        if (applicationConfiguration is not null && configuration.ClientId != applicationConfiguration.ClientId)
            throw new InvalidOperationException("Esta versão já tem um cliente Google integrado. Use Entrar com Google.");
        credentials = configuration.CreateCredentials();
        mailCache.Clear();
        Save();
    }
    private void Save() => secrets.Write(JsonSerializer.Serialize(credentials));
    public async Task ConnectAsync(Action<string> openBrowser, CancellationToken cancellation = default)
    {
        if (!Configured) throw new InvalidOperationException("O login Google ainda não foi habilitado nesta versão do Pingo. É necessário configurar o cliente OAuth do aplicativo uma única vez.");
        var current = credentials!;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromMinutes(3));
        var ct = timeout.Token;
        string verifier = Base64Url(RandomNumberGenerator.GetBytes(48));
        string state = Base64Url(RandomNumberGenerator.GetBytes(32));
        string challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        // Bind the OS-assigned port before opening the system browser; no URL ACL or public listener.
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            string redirect = $"http://127.0.0.1:{port}/";
            string scopes = string.Join(' ', "https://www.googleapis.com/auth/gmail.metadata", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/tasks");
            string auth = "https://accounts.google.com/o/oauth2/v2/auth?" + Query(new()
            {
                ["client_id"] = current.ClientId, ["redirect_uri"] = redirect, ["response_type"] = "code",
                ["scope"] = scopes, ["access_type"] = "offline", ["prompt"] = "consent", ["state"] = state,
                ["code_challenge"] = challenge, ["code_challenge_method"] = "S256"
            });
            openBrowser(auth);
            string? code = null;
            while (code is null)
            {
                using var socket = await listener.AcceptTcpClientAsync(ct);
                await using var stream = socket.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
                string request = await reader.ReadLineAsync(ct) ?? "";
                if (request.Length > 8192) continue;
                var parts = request.Split(' ');
                var values = parts.Length >= 2 ? ParseQuery(parts[1]) : new Dictionary<string, string>();
                bool valid = parts.Length >= 2 && parts[0] == "GET" && values.GetValueOrDefault("state") == state;
                string body = valid ? "<!doctype html><meta charset='utf-8'><title>Pingo</title><body style='font:20px system-ui;padding:60px;background:#F7F7FC;color:#26213C'><h1>Volte para o Pingo.</h1><p>Você pode fechar esta aba e conferir a conexão no aplicativo.</p></body>" : "Invalid callback";
                byte[] bytes = Encoding.UTF8.GetBytes(body);
                var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {(valid ? "200 OK" : "400 Bad Request")}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
                await stream.WriteAsync(header, ct); await stream.WriteAsync(bytes, ct);
                if (!valid) continue;
                if (values.ContainsKey("error")) throw new InvalidOperationException("O login foi cancelado ou as permissões não foram concedidas.");
                code = values.GetValueOrDefault("code") ?? throw new InvalidDataException("O Google não devolveu o código de autorização.");
            }
            var fields = new Dictionary<string, string> { ["code"] = code, ["client_id"] = current.ClientId, ["redirect_uri"] = redirect, ["grant_type"] = "authorization_code", ["code_verifier"] = verifier };
            if (current.ClientSecret.Length > 0) fields["client_secret"] = current.ClientSecret;
            await ExchangeAsync(fields, ct);
        }
        finally { listener.Stop(); }
    }
    public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static Dictionary<string, string> ParseQuery(string uri)
    {
        var query = uri.Contains('?') ? uri[(uri.IndexOf('?') + 1)..] : uri;
        return query.Split('&', StringSplitOptions.RemoveEmptyEntries).Select(s => s.Split('=', 2))
            .GroupBy(s => Uri.UnescapeDataString(s[0])).ToDictionary(g => g.Key, g => Uri.UnescapeDataString(g.Last().ElementAtOrDefault(1)?.Replace('+', ' ') ?? ""));
    }
    private static string Query(Dictionary<string, string> values) => string.Join('&', values.Select(p => Uri.EscapeDataString(p.Key) + "=" + Uri.EscapeDataString(p.Value)));
    private async Task ExchangeAsync(Dictionary<string, string> values, CancellationToken ct)
    {
        using var response = await http.PostAsync(TokenUrl, new FormUrlEncodedContent(values), ct);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(response.StatusCode == HttpStatusCode.BadRequest ? "A autorização Google expirou ou foi revogada. Conecte sua conta novamente." : "Não foi possível autorizar a conta Google. Tente novamente.");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;
        credentials!.AccessToken = root.GetProperty("access_token").GetString()!;
        credentials.Expires = DateTimeOffset.UtcNow.AddSeconds(root.GetProperty("expires_in").GetInt32());
        if (root.TryGetProperty("refresh_token", out var refresh)) credentials.RefreshToken = refresh.GetString()!;
        Save();
    }
    private async Task<string> AccessAsync(CancellationToken ct)
    {
        await tokenLock.WaitAsync(ct);
        try
        {
            if (credentials is null || !Connected) throw new InvalidOperationException("Conecte sua conta Google nas configurações.");
            if (credentials.Expires <= DateTimeOffset.UtcNow.AddMinutes(2))
            {
                var fields = new Dictionary<string, string> { ["client_id"] = credentials.ClientId, ["refresh_token"] = credentials.RefreshToken, ["grant_type"] = "refresh_token" };
                if (credentials.ClientSecret.Length > 0) fields["client_secret"] = credentials.ClientSecret;
                await ExchangeAsync(fields, ct);
            }
            return credentials.AccessToken;
        }
        finally { tokenLock.Release(); }
    }
    private async Task<JsonDocument> SendAsync(string url, CancellationToken ct, HttpMethod? method = null, object? payload = null)
    {
        using var request = new HttpRequestMessage(method ?? HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await AccessAsync(ct));
        if (payload is not null) request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Conflict && method == HttpMethod.Post) throw new EventConflictException();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(response.StatusCode switch
            {
                HttpStatusCode.Unauthorized => "Login expirado. Reconecte o Google.",
                HttpStatusCode.Forbidden => "Acesso não autorizado. Confira as permissões e se a API está ativada no projeto Google.",
                HttpStatusCode.TooManyRequests => "Limite Google atingido. Tentarei na próxima sincronização.",
                _ => "O Google não respondeu como esperado. Tentarei na próxima sincronização."
            });
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }
    private async Task<List<JsonElement>> PagesAsync(string url, string key, CancellationToken ct)
    {
        var result = new List<JsonElement>();
        string? page = null;
        do
        {
            using var doc = await SendAsync(url + (page is null ? "" : "&pageToken=" + Uri.EscapeDataString(page)), ct);
            if (doc.RootElement.TryGetProperty(key, out var items)) result.AddRange(items.EnumerateArray().Select(e => e.Clone()));
            page = doc.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
        } while (!string.IsNullOrEmpty(page));
        return result;
    }
    public async Task<GoogleSnapshot> SyncAsync(DateTimeOffset now, CancellationToken ct = default)
    {
        List<string> errors = []; List<Appointment>? events = null; List<Todo>? tasks = null; List<Mail>? mail = null; int? unread = null; string? email = null;
        // Isolate failures: a disabled Tasks API must not stop calendar reminders or email.
        try { events = await ReadEventsAsync(now, ct); } catch (Exception ex) when (ex is not OperationCanceledException) { errors.Add("Agenda: " + ex.Message); }
        try { tasks = await ReadTasksAsync(ct); } catch (Exception ex) when (ex is not OperationCanceledException) { errors.Add("Tarefas: " + ex.Message); }
        try
        {
            (mail, unread) = await ReadMailAsync(ct);
            using var profile = await SendAsync("https://gmail.googleapis.com/gmail/v1/users/me/profile", ct);
            email = profile.RootElement.GetProperty("emailAddress").GetString();
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { errors.Add("Gmail: " + ex.Message); }
        return new(events, tasks, mail, unread, email, errors);
    }
    private async Task<List<Appointment>> ReadEventsAsync(DateTimeOffset now, CancellationToken ct)
    {
        var start = new DateTimeOffset(now.Date.AddDays(-1), now.Offset);
        string url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=" + Uri.EscapeDataString(start.ToString("o")) + "&timeMax=" + Uri.EscapeDataString(start.AddDays(32).ToString("o"));
        return (await PagesAsync(url, "items", ct)).Where(e => Text(e, "status") != "cancelled").Select(ParseEvent).ToList();
    }
    public static Appointment ParseEvent(JsonElement e)
    {
        var start = e.GetProperty("start"); var end = e.GetProperty("end");
        bool allDay = start.TryGetProperty("date", out var date);
        DateTimeOffset s = allDay ? new DateTimeOffset(DateTime.SpecifyKind(DateTime.ParseExact(date.GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Local)) : DateTimeOffset.Parse(start.GetProperty("dateTime").GetString()!, CultureInfo.InvariantCulture);
        DateTimeOffset finish = allDay ? new DateTimeOffset(DateTime.SpecifyKind(DateTime.ParseExact(end.GetProperty("date").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Local)) : DateTimeOffset.Parse(end.GetProperty("dateTime").GetString()!, CultureInfo.InvariantCulture);
        return new(Text(e, "id"), Text(e, "summary", "Sem título"), s, finish, allDay, "google");
    }
    private async Task<List<Todo>> ReadTasksAsync(CancellationToken ct)
    {
        List<Todo> result = [];
        var lists = await PagesAsync("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100", "items", ct);
        foreach (var list in lists)
        {
            string id = Text(list, "id");
            var tasks = await PagesAsync("https://tasks.googleapis.com/tasks/v1/lists/" + Uri.EscapeDataString(id) + "/tasks?showCompleted=false&showHidden=false&showAssigned=true&maxResults=100", "items", ct);
            foreach (var t in tasks)
            {
                // Google Tasks stores a date only; do not shift midnight UTC into the previous local day.
                DateOnly? due = t.TryGetProperty("due", out var d) ? DateOnly.ParseExact(d.GetString()![..10], "yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
                result.Add(new(Text(t, "id"), Text(t, "title", "Sem título"), due, Text(t, "status") == "completed", id));
            }
        }
        return result;
    }
    private async Task<(List<Mail>, int)> ReadMailAsync(CancellationToken ct)
    {
        using var label = await SendAsync("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", ct);
        int count = label.RootElement.TryGetProperty("messagesUnread", out var n) ? n.GetInt32() : 0;
        using var list = await SendAsync("https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&labelIds=UNREAD&maxResults=50", ct);
        List<Mail> result = [];
        if (list.RootElement.TryGetProperty("messages", out var messages))
            foreach (var item in messages.EnumerateArray())
            {
                var id = Text(item, "id");
                if (mailCache.TryGetValue(id, out var cached)) { result.Add(cached); continue; }
                using var doc = await SendAsync("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + Uri.EscapeDataString(id) + "?format=metadata&metadataHeaders=Subject&metadataHeaders=From", ct);
                var m = doc.RootElement;
                var headers = m.GetProperty("payload").GetProperty("headers").EnumerateArray().ToList();
                string Header(string name) => headers.FirstOrDefault(h => Text(h, "name").Equals(name, StringComparison.OrdinalIgnoreCase)) is var h && h.ValueKind == JsonValueKind.Object ? Text(h, "value") : "";
                var mail = new Mail(id, Header("Subject"), Header("From"), DateTimeOffset.FromUnixTimeMilliseconds(long.Parse(Text(m, "internalDate"), CultureInfo.InvariantCulture)));
                result.Add(mail); mailCache[id] = mail;
            }
        if (mailCache.Count > 200) { var current = result.Select(m => m.Id).ToHashSet(); foreach (var id in mailCache.Keys.Where(id => !current.Contains(id)).ToList()) mailCache.Remove(id); }
        return (result.OrderByDescending(m => m.Received).ToList(), count);
    }
    public async Task<Appointment> CreateEventAsync(string title, DateTimeOffset start, DateTimeOffset end, int reminderMinutes, string requestId, CancellationToken ct = default)
    {
        // Stable client ID makes an explicit retry idempotent if the response is lost after insertion.
        var payload = new { id = requestId, summary = title, start = new { dateTime = start.ToString("o") }, end = new { dateTime = end.ToString("o") }, reminders = new { useDefault = false, overrides = new[] { new { method = "popup", minutes = reminderMinutes } } } };
        JsonDocument doc;
        try { doc = await SendAsync("https://www.googleapis.com/calendar/v3/calendars/primary/events", ct, HttpMethod.Post, payload); }
        catch (EventConflictException) { doc = await SendAsync("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + Uri.EscapeDataString(requestId), ct); }
        using (doc) return ParseEvent(doc.RootElement);
    }
    public async Task CompleteTaskAsync(Todo task, CancellationToken ct = default)
    {
        using var doc = await SendAsync("https://tasks.googleapis.com/tasks/v1/lists/" + Uri.EscapeDataString(task.ListId!) + "/tasks/" + Uri.EscapeDataString(task.Id), ct, HttpMethod.Patch, new { status = "completed" });
    }
    public void Disconnect()
    {
        var client = applicationConfiguration ?? (credentials is null ? null : new GoogleOAuthConfiguration(credentials.ClientId, credentials.ClientSecret));
        secrets.Clear(); credentials = client?.CreateCredentials(); mailCache.Clear();
        // Legacy installations have no compiled client yet. Preserve only the app identity,
        // so removing manual import does not make a later sign-in impossible after disconnect.
        if (applicationConfiguration is null && credentials is not null) Save();
    }
    private static string Text(JsonElement e, string key, string fallback = "") => e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;
}
