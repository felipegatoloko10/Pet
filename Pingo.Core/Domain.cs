using System.Globalization;
using System.Text.Json;

namespace Pingo.Core;

public sealed record Todo(string Id, string Title, DateOnly? Due, bool Done = false, string? ListId = null);
public sealed record Appointment(string Id, string Title, DateTimeOffset Start, DateTimeOffset End, bool AllDay = false, string Source = "local");
public sealed record Mail(string Id, string Subject, string Sender, DateTimeOffset Received);
public sealed record Notice(string Key, string Title, string Body);
public sealed class Settings
{
    public string BriefingTime { get; set; } = "08:00";
    public int ReminderMinutes { get; set; } = 30;
    public bool Voice { get; set; }
    public bool MailAlerts { get; set; } = true;
    public bool Paused { get; set; }
    public double PetLeft { get; set; } = -1;
    public double PetTop { get; set; } = -1;
}
public sealed class State
{
    public Settings Settings { get; set; } = new();
    public List<Todo> Todos { get; set; } = [];
    public List<Appointment> Events { get; set; } = [];
    public HashSet<string> Delivered { get; set; } = [];
    public HashSet<string> SeenMail { get; set; } = [];
    public bool MailInitialized { get; set; }
}

public sealed class StateStore(string folder)
{
    public string Folder { get; } = folder;
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    public State Load()
    {
        var path = Path.Combine(Folder, "state.json");
        if (!File.Exists(path)) return new();
        try { return JsonSerializer.Deserialize<State>(File.ReadAllText(path), Json) ?? throw new InvalidDataException("Dados vazios."); }
        catch (JsonException ex) { throw new InvalidDataException("O arquivo de dados não pôde ser lido. Ele foi preservado: " + path, ex); }
    }
    public void Save(State state)
    {
        Directory.CreateDirectory(Folder);
        var path = Path.Combine(Folder, "state.json");
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(state, Json));
        File.Move(temp, path, true);
    }
}

public static class Routine
{
    public static List<Notice> Due(State state, IEnumerable<Appointment> events, DateTimeOffset now, string summary)
    {
        if (state.Settings.Paused) return [];
        List<Notice> result = [];
        var date = DateOnly.FromDateTime(now.Date);
        if (TimeOnly.TryParseExact(state.Settings.BriefingTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var briefing)
            && TimeOnly.FromDateTime(now.DateTime) >= briefing)
        {
            var key = "brief:" + date.ToString("yyyy-MM-dd");
            if (state.Delivered.Add(key)) result.Add(new(key, "Bom dia! Vamos organizar seu dia?", summary));
        }
        foreach (var e in events.Where(e => !e.AllDay && e.Start > now && e.Start <= now.AddMinutes(state.Settings.ReminderMinutes)))
        {
            // Include occurrence time: recurring events and rescheduled meetings get their own reminder.
            var key = $"event:{e.Source}:{e.Id}:{e.Start.UtcTicks}";
            if (state.Delivered.Add(key))
            {
                int minutes = Math.Max(1, (int)Math.Ceiling((e.Start - now).TotalMinutes));
                result.Add(new(key, $"Daqui a {minutes} min", $"{e.Title}, às {e.Start.ToLocalTime():HH:mm}."));
            }
        }
        return result;
    }
    public static List<Todo> TodayTasks(IEnumerable<Todo> tasks, DateOnly today) =>
        tasks.Where(t => !t.Done && (t.Due is null || t.Due <= today)).OrderBy(t => t.Due ?? today).ToList();

    public static string Summary(IEnumerable<Todo> tasks, IEnumerable<Appointment> events, DateTimeOffset now, int? unread, bool connected, bool fresh)
    {
        var today = DateOnly.FromDateTime(now.Date);
        var agenda = events.Where(e => DateOnly.FromDateTime(e.Start.ToLocalTime().Date) <= today && DateOnly.FromDateTime(e.End.ToLocalTime().DateTime.AddTicks(-1)) >= today).OrderBy(e => e.Start).ToList();
        var pending = TodayTasks(tasks, today);
        var lines = new List<string> { $"Hoje você tem {agenda.Count} compromisso(s) e {pending.Count} tarefa(s) pendente(s)." };
        var next = agenda.FirstOrDefault(e => !e.AllDay && e.End > now);
        if (next is not null) lines.Add($"Próximo: {next.Title}, às {next.Start.ToLocalTime():HH:mm}.");
        if (pending.Count > 0) lines.Add("Para começar: " + string.Join("; ", pending.Take(3).Select(t => t.Title)) + ".");
        lines.Add(connected ? fresh ? $"Gmail: {unread ?? 0} e-mail(s) não lido(s) na caixa de entrada." : "Google sem atualização recente. Confira a sincronização." : "Conecte o Google para incluir e-mails e agenda no resumo.");
        return string.Join("\n", lines);
    }
}

public enum CommandKind { Summary, Task, Event, Help }
public sealed record PetCommand(CommandKind Kind, string Title = "", DateTimeOffset? When = null);
public static class Commands
{
    public static PetCommand Parse(string input, DateTimeOffset now)
    {
        string text = input.Trim();
        if (text.Equals("meu dia", StringComparison.OrdinalIgnoreCase) || text.Equals("resumo", StringComparison.OrdinalIgnoreCase)) return new(CommandKind.Summary);
        if (text.StartsWith("tarefa ", StringComparison.OrdinalIgnoreCase) && text.Length > 7) return new(CommandKind.Task, text[7..].Trim());
        // Keep scheduling explicit: parse a constrained grammar and open a review form before saving.
        var match = System.Text.RegularExpressions.Regex.Match(text, @"^(?:agendar|marcar)\s+(.+?)\s+(hoje|amanhã|amanha|\d{2}/\d{2}/\d{4})\s+(?:às|as)\s+(\d{1,2})(?:[:h](\d{2})?)?h?$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (match.Success)
        {
            DateTime day;
            var label = match.Groups[2].Value.ToLowerInvariant();
            if (label == "hoje") day = now.Date;
            else if (label is "amanhã" or "amanha") day = now.Date.AddDays(1);
            else if (!DateTime.TryParseExact(label, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out day)) return new(CommandKind.Help);
            int hour = int.Parse(match.Groups[3].Value), minute = match.Groups[4].Success ? int.Parse(match.Groups[4].Value) : 0;
            if (hour > 23 || minute > 59) return new(CommandKind.Help);
            var local = DateTime.SpecifyKind(day.AddHours(hour).AddMinutes(minute), DateTimeKind.Unspecified);
            if (TimeZoneInfo.Local.IsInvalidTime(local)) return new(CommandKind.Help);
            return new(CommandKind.Event, match.Groups[1].Value, new DateTimeOffset(local, TimeZoneInfo.Local.GetUtcOffset(local)));
        }
        return new(CommandKind.Help);
    }
}
