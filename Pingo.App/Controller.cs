using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Pingo.Core;

namespace Pingo.Desktop;

public sealed class Controller : IDisposable
{
    private readonly StateStore store;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(25) };
    private readonly CancellationTokenSource lifetime = new();
    private readonly DispatcherTimer tick = new() { Interval = TimeSpan.FromSeconds(20) };
    private readonly DispatcherTimer noticeTick = new() { Interval = TimeSpan.FromSeconds(14) };
    private readonly Queue<Notice> notices = new();
    private readonly System.Windows.Forms.NotifyIcon tray;
    private DateTimeOffset lastAttempt = DateTimeOffset.MinValue;
    private bool syncing;
    private bool sessionReady;
    private bool connecting;
    private MainWindow? dashboard;
    private object? speaker;
    public State State { get; }
    public GoogleClient Google { get; }
    public PetWindow Pet { get; }
    public List<Appointment> GoogleEvents { get; private set; } = [];
    public List<Todo> GoogleTasks { get; private set; } = [];
    public List<Mail> Mail { get; private set; } = [];
    public int? Unread { get; private set; }
    public string Email { get; private set; } = "";
    public DateTimeOffset? LastSync { get; private set; }
    public bool CalendarFresh { get; private set; }
    public bool MailFresh { get; private set; }
    public string Status { get; private set; } = "Seu espaço está pronto. Conecte o Google quando quiser.";
    public List<Notice> History { get; } = [];
    public event Action? Changed;
    public IEnumerable<Appointment> Events => State.Events.Concat(GoogleEvents).OrderBy(e => e.Start);
    public IEnumerable<Todo> Tasks => State.Todos.Concat(GoogleTasks);
    public string Summary => Routine.Summary(Tasks, Events, DateTimeOffset.Now, Unread, Google.Connected, MailFresh && CalendarFresh);

    public Controller(string dataFolder)
    {
        store = new(dataFolder); State = store.Load();
        Google = new(http, new WindowsSecrets(Path.Combine(dataFolder, "google.enc")));
        Pet = new(this);
        tray = new() { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? System.Drawing.SystemIcons.Information, Text = "Pingo · seu companheiro", Visible = true };
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("Abrir meu dia", null, (_, _) => ShowDashboard());
        menu.Items.Add("Pausar / retomar avisos", null, (_, _) => TogglePause());
        menu.Items.Add("Sair do Pingo", null, (_, _) => System.Windows.Application.Current.Shutdown());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (_, _) => ShowDashboard();
        tray.BalloonTipClicked += (_, _) => ShowDashboard();
        tick.Tick += async (_, _) => await PulseAsync();
        noticeTick.Tick += (_, _) => DeliverNext();
    }
    public async Task StartAsync(bool quiet = false)
    {
        Pet.Show(); if (!quiet) ShowDashboard(); tick.Start(); noticeTick.Start();
        await PulseAsync();
    }
    public void ShowDashboard(string? page = null)
    {
        dashboard ??= new MainWindow(this);
        if (page is not null) dashboard.SelectPage(page);
        dashboard.Show(); dashboard.WindowState = WindowState.Normal; dashboard.Activate(); dashboard.Refresh();
    }
    public void Save()
    {
        try { store.Save(State); }
        catch (IOException) { Status = "Não consegui salvar os dados. Confira o espaço e as permissões da pasta do Pingo."; }
        catch (UnauthorizedAccessException) { Status = "A pasta de dados está sem permissão de escrita."; }
        Changed?.Invoke();
    }
    public void TogglePause() { State.Settings.Paused = !State.Settings.Paused; if (State.Settings.Paused) notices.Clear(); Save(); }
    public void UpdateStatus(string status) { Status = status; Changed?.Invoke(); }
    public void AddTask(string title, DateOnly? due)
    {
        State.Todos.Add(new(Guid.NewGuid().ToString("N"), title, due)); Save(); Pet.Say("Anotado!", title + " está na sua lista.");
    }
    public async Task CompleteTaskAsync(Todo task)
    {
        try
        {
            if (task.ListId is null) { int i = State.Todos.FindIndex(t => t.Id == task.Id); if (i >= 0) State.Todos[i] = task with { Done = true }; }
            else { await Google.CompleteTaskAsync(task, lifetime.Token); GoogleTasks.RemoveAll(t => t.Id == task.Id && t.ListId == task.ListId); }
            Save(); Pet.Say("Uma coisa a menos.", "Tarefa concluída: " + task.Title);
        }
        catch (Exception ex) { UpdateStatus("Não consegui concluir a tarefa. " + Friendly(ex)); }
    }
    public async Task SaveEventAsync(string title, DateTimeOffset start, DateTimeOffset end, bool google, string requestId)
    {
        if (google)
        {
            var item = await Google.CreateEventAsync(title, start, end, State.Settings.ReminderMinutes, requestId, lifetime.Token);
            GoogleEvents.RemoveAll(e => e.Id == item.Id); GoogleEvents.Add(item);
        }
        else State.Events.Add(new(Guid.NewGuid().ToString("N"), title, start, end));
        Save(); Pet.Say("Compromisso salvo.", $"{title}, {start.ToLocalTime():dd/MM 'às' HH:mm}. Vou lembrar você antes.");
    }
    public void Command(string input)
    {
        var command = Commands.Parse(input, DateTimeOffset.Now);
        switch (command.Kind)
        {
            case CommandKind.Summary: Pet.Say("Seu dia, com calma.", Summary); ShowDashboard(); break;
            case CommandKind.Task: AddTask(command.Title, DateOnly.FromDateTime(DateTime.Today)); break;
            case CommandKind.Event: ShowDashboard(); dashboard!.NewEvent(command.Title, command.When); break;
            default: Pet.Say("Pode falar assim:", "“meu dia”, “tarefa comprar pão” ou “agendar dentista amanhã às 15h”."); break;
        }
    }
    private async Task PulseAsync()
    {
        if (connecting || syncing) return;
        if (Google.Connected && DateTimeOffset.Now - lastAttempt >= TimeSpan.FromMinutes(1)) await SyncAsync();
        else if (!Google.Connected) sessionReady = true;
        if (!sessionReady || State.Settings.Paused) return;
        foreach (var notice in Routine.Due(State, Events, DateTimeOffset.Now, Summary)) notices.Enqueue(notice);
        Save();
        if (notices.Count > 0) DeliverNext();
    }
    public async Task SyncAsync()
    {
        if (syncing || connecting || !Google.Connected) return;
        syncing = true; lastAttempt = DateTimeOffset.Now; UpdateStatus("Atualizando seu Google…");
        try
        {
            var snapshot = await Google.SyncAsync(DateTimeOffset.Now, lifetime.Token);
            CalendarFresh = snapshot.Events is not null; MailFresh = snapshot.Mail is not null;
            if (snapshot.Events is not null) GoogleEvents = snapshot.Events;
            if (snapshot.Tasks is not null) GoogleTasks = snapshot.Tasks;
            if (snapshot.Mail is not null)
            {
                Mail = snapshot.Mail; Unread = snapshot.Unread;
                var fresh = Mail.Where(m => !State.SeenMail.Contains(m.Id)).ToList();
                if (State.MailInitialized && State.Settings.MailAlerts && !State.Settings.Paused && fresh.Count > 0)
                    notices.Enqueue(new("mail:" + DateTimeOffset.Now.UtcTicks, fresh.Count == 1 ? "Chegou um e-mail não lido." : $"{fresh.Count} novos e-mails não lidos.", string.Join("\n", fresh.Take(3).Select(m => m.Sender + ": " + m.Subject))));
                foreach (var m in Mail) State.SeenMail.Add(m.Id);
                // Bound the deduplication journal without dropping any message in the current inbox snapshot.
                if (State.SeenMail.Count > 10000) State.SeenMail = Mail.Select(m => m.Id).ToHashSet();
                State.MailInitialized = true;
            }
            Email = snapshot.Email ?? Email;
            if (snapshot.Errors.Count == 0) LastSync = DateTimeOffset.Now;
            Status = snapshot.Errors.Count == 0 ? $"Tudo atualizado às {DateTime.Now:HH:mm}." : string.Join("\n", snapshot.Errors);
            Save();
        }
        catch (Exception ex) { CalendarFresh = false; MailFresh = false; UpdateStatus(Friendly(ex)); }
        finally { syncing = false; sessionReady = true; Changed?.Invoke(); }
    }
    public async Task ConnectAsync()
    {
        if (syncing || connecting) { UpdateStatus("Espere a atualização atual terminar e tente novamente."); return; }
        connecting = true; UpdateStatus("Conclua o login no navegador. A janela pode levar alguns instantes para abrir.");
        try
        {
            await Google.ConnectAsync(OpenUrl, lifetime.Token);
            State.MailInitialized = false; State.SeenMail.Clear();
            UpdateStatus("Conta autorizada. Buscando sua rotina…");
        }
        catch (Exception ex) { UpdateStatus(Friendly(ex)); }
        finally { connecting = false; }
        if (Google.Connected) await SyncAsync();
    }
    public bool CanChangeAccount => !syncing && !connecting;
    public void Disconnect()
    {
        if (!CanChangeAccount) { UpdateStatus("Espere a atualização ou o login terminar antes de desconectar."); return; }
        Google.Disconnect(); GoogleEvents.Clear(); GoogleTasks.Clear(); Mail.Clear(); Unread = null; Email = "";
        LastSync = null; CalendarFresh = false; MailFresh = false; State.MailInitialized = false; State.SeenMail.Clear();
        notices.Clear(); Status = "Google desconectado deste computador. Tarefas e agenda locais continuam disponíveis."; Save();
    }
    private void DeliverNext()
    {
        if (notices.Count == 0 || State.Settings.Paused) return;
        var notice = notices.Dequeue(); History.Insert(0, notice); if (History.Count > 60) History.RemoveAt(60);
        Pet.Say(notice.Title, notice.Body);
        tray.BalloonTipTitle = notice.Title; tray.BalloonTipText = notice.Body.Length > 240 ? notice.Body[..237] + "…" : notice.Body;
        tray.ShowBalloonTip(10000);
        if (State.Settings.Voice)
        {
            try
            {
                speaker ??= Activator.CreateInstance(Type.GetTypeFromProgID("SAPI.SpVoice")!);
                speaker!.GetType().InvokeMember("Speak", System.Reflection.BindingFlags.InvokeMethod, null, speaker, new object[] { notice.Title + ". " + notice.Body, 3 });
            }
            catch { UpdateStatus("A voz do Windows não está disponível. Os avisos em texto continuam ativos."); }
        }
        Changed?.Invoke();
    }
    public static void OpenUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https") throw new InvalidOperationException("Endereço inválido.");
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }
    public static string Friendly(Exception ex) => ex switch
    {
        OperationCanceledException => "A operação demorou ou foi cancelada. Tente novamente.",
        HttpRequestException => "Sem conexão com o Google. Confira a internet; vou tentar novamente.",
        IOException => "Não consegui acessar um arquivo. Confira a pasta e tente novamente.",
        _ => ex.Message
    };
    public void Dispose()
    {
        tick.Stop(); noticeTick.Stop(); lifetime.Cancel(); tray.Visible = false; tray.Dispose(); Save(); http.Dispose(); lifetime.Dispose();
        if (speaker is not null && Marshal.IsComObject(speaker)) Marshal.ReleaseComObject(speaker);
    }
}

// Windows DPAPI: OAuth credentials and tokens can only be decrypted by this Windows user.
public sealed class WindowsSecrets(string path) : ISecretStore
{
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Size; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
    public string? Read() => File.Exists(path) ? Encoding.UTF8.GetString(Transform(File.ReadAllBytes(path), false)) : null;
    public void Write(string json)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp"; File.WriteAllBytes(temp, Transform(Encoding.UTF8.GetBytes(json), true)); File.Move(temp, path, true);
    }
    public void Clear() { if (File.Exists(path)) File.Delete(path); }
    public static byte[] Transform(byte[] data, bool protect)
    {
        Blob input = new() { Size = data.Length, Data = Marshal.AllocHGlobal(data.Length) }; Blob output = new();
        try
        {
            Marshal.Copy(data, 0, input.Data, data.Length);
            bool ok = protect ? CryptProtectData(ref input, "Pingo Google", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output) : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!ok) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Não foi possível proteger ou abrir a autorização Google neste usuário do Windows.");
            byte[] result = new byte[output.Size]; Marshal.Copy(output.Data, result, 0, output.Size); return result;
        }
        finally { Marshal.FreeHGlobal(input.Data); if (output.Data != IntPtr.Zero) LocalFree(output.Data); }
    }
}
