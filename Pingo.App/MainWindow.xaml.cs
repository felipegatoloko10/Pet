using System;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Pingo.Core;

namespace Pingo.Desktop;
public partial class MainWindow : Window
{
    private readonly Controller c;
    private string page = "Hoje";
    private static readonly CultureInfo Pt = CultureInfo.GetCultureInfo("pt-BR");
    private static Brush Color(string hex) => (Brush)new BrushConverter().ConvertFromString(hex)!;
    public MainWindow(Controller controller) { c = controller; InitializeComponent(); c.Changed += Refresh; Refresh(); }
    public void SelectPage(string name) { page = name; Refresh(); }
    private void Navigate(object sender, RoutedEventArgs e) => SelectPage((string)((Button)sender).Tag);
    public void Refresh()
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(Refresh); return; }
        DateLabel.Text = DateTime.Today.ToString("dddd, dd 'de' MMMM", Pt).ToUpper(Pt);
        PageTitle.Text = page == "Hoje" ? (DateTime.Now.Hour < 12 ? "Bom dia. Vamos com calma?" : "Seu dia, um passo de cada vez.") : page;
        InfoText.Text = c.Status;
        AccountLabel.Text = c.Google.Connected ? "●  " + (c.Email.Length > 0 ? c.Email : "Google conectado") : "○  Modo local";
        FooterLabel.Text = c.State.Settings.Paused ? "Avisos pausados · o painel continua disponível." : c.Google.Connected ? "Consulta Google a cada minuto · mantenha o Pingo aberto." : "Tarefas e agenda locais · mantenha o Pingo aberto para receber avisos.";
        SyncButton.IsEnabled = c.Google.Connected && c.CanChangeAccount;
        foreach (var nav in new[] { NavHome, NavTasks, NavCalendar, NavMail, NavActivity, NavSettings })
        { bool active = (string)nav.Tag == page; nav.Background = active ? Color("#EEE9FA") : Brushes.Transparent; nav.Foreground = Color(active ? "#7459DA" : "#77758A"); }
        // Preserve edits in Settings while background synchronization updates the status banner.
        if (page == "Ajustes" && ContentPanel.Tag as string == "Ajustes") return;
        ContentPanel.Children.Clear(); ContentPanel.Tag = page;
        switch (page)
        {
            case "Hoje": Home(); break;
            case "Tarefas": TasksPage(); break;
            case "Agenda": CalendarPage(); break;
            case "E-mails": MailPage(); break;
            case "Avisos": ActivityPage(); break;
            case "Ajustes": SettingsPage(); break;
        }
    }
    private static TextBlock Text(string text, double size = 14, string color = "#242237", bool bold = false) => new() { Text = text, FontSize = size, Foreground = Color(color), FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, TextWrapping = TextWrapping.Wrap };
    private static StackPanel Stack() => new();
    private Border Card(UIElement child) => new() { Style = (Style)FindResource("Card"), Child = child, Margin = new Thickness(0, 0, 0, 16) };
    private Button Action(string title, Action action, bool primary = false)
    {
        var button = new Button { Content = title }; if (primary) button.Style = (Style)FindResource("Primary");
        button.Click += (_, _) => action(); return button;
    }
    private Button AsyncAction(string title, Func<Task> action, bool primary = false)
    {
        var button = new Button { Content = title }; if (primary) button.Style = (Style)FindResource("Primary");
        button.Click += async (_, _) => { button.IsEnabled = false; try { await action(); } catch (Exception ex) { c.UpdateStatus(Controller.Friendly(ex)); } finally { button.IsEnabled = true; } }; return button;
    }
    private void Home()
    {
        var hero = new Grid(); hero.ColumnDefinitions.Add(new()); hero.ColumnDefinitions.Add(new() { Width = new GridLength(170) });
        var copy = Stack(); copy.VerticalAlignment = VerticalAlignment.Center;
        copy.Children.Add(Text("UM COMPANHEIRO PARA SUA ROTINA", 10, "#8A72B4", true));
        var heading = Text("Menos coisas na cabeça.\nMais espaço para o seu dia.", 25, "#443060", true); heading.Margin = new Thickness(0, 12, 0, 12); copy.Children.Add(heading);
        copy.Children.Add(Text("Eu junto seus lembretes, sua agenda e suas tarefas.\nVocê escolhe por onde começar.", 13, "#857494"));
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 18, 0, 0) };
        buttons.Children.Add(Action("＋  Nova tarefa", NewTask, true)); buttons.Children.Add(Action("Ver meu resumo", () => { c.Pet.Say("Seu dia, com calma.", c.Summary); ShowSummary(); })); copy.Children.Add(buttons);
        hero.Children.Add(copy); var pet = new PetArtwork { Width = 165, Height = 180, VerticalAlignment = VerticalAlignment.Center }; Grid.SetColumn(pet, 1); hero.Children.Add(pet);
        ContentPanel.Children.Add(new Border { Background = Color("#EFE8F8"), CornerRadius = new CornerRadius(20), Padding = new Thickness(25, 22, 18, 22), Child = hero, Margin = new Thickness(0, 0, 0, 20) });
        var stats = new System.Windows.Controls.Primitives.UniformGrid { Columns = 3, Margin = new Thickness(0, 0, -12, 4) };
        var today = DateOnly.FromDateTime(DateTime.Today);
        Stat(stats, TodayEvents().Count().ToString(), "compromissos hoje", "#A1D5C1");
        Stat(stats, Routine.TodayTasks(c.Tasks, today).Count.ToString(), "tarefas para cuidar", "#C6B7E8");
        Stat(stats, c.Unread?.ToString() ?? "—", "não lidos na caixa de entrada", "#E6C39D"); ContentPanel.Children.Add(stats);
        var columns = new Grid(); columns.ColumnDefinitions.Add(new()); columns.ColumnDefinitions.Add(new() { Width = new GridLength(18) }); columns.ColumnDefinitions.Add(new());
        var agenda = Stack(); agenda.Children.Add(Text("Na sua agenda", 16, bold: true)); AddSpace(agenda, 14);
        var appointments = TodayEvents().Take(4).ToList();
        if (appointments.Count == 0) Empty(agenda, "Um respiro na agenda.", "Seus compromissos de hoje aparecem aqui.");
        foreach (var item in appointments) EventRow(agenda, item);
        var tasks = Stack(); tasks.Children.Add(Text("Um passo de cada vez", 16, bold: true)); AddSpace(tasks, 12);
        var pending = Routine.TodayTasks(c.Tasks, today).Take(5).ToList();
        if (pending.Count == 0) Empty(tasks, "Tudo tranquilo por aqui.", "Adicione uma tarefa para começar.");
        foreach (var task in pending) TaskRow(tasks, task);
        var a = Card(agenda); columns.Children.Add(a); var b = Card(tasks); Grid.SetColumn(b, 2); columns.Children.Add(b); ContentPanel.Children.Add(columns);
    }
    private System.Collections.Generic.IEnumerable<Appointment> TodayEvents() => c.Events.Where(e => e.Start.ToLocalTime().Date <= DateTime.Today && e.End.ToLocalTime().DateTime.AddTicks(-1).Date >= DateTime.Today);
    private void Stat(Panel parent, string count, string label, string dot)
    {
        var stack = Stack(); var row = new DockPanel(); row.Children.Add(Text("●", 13, dot)); var num = Text(count, 28, bold: true); num.Margin = new Thickness(10, 0, 0, 0); row.Children.Add(num); stack.Children.Add(row); stack.Children.Add(Text(label, 11, "#898294"));
        var card = Card(stack); card.Margin = new Thickness(0, 0, 12, 16); card.Padding = new Thickness(18, 14, 18, 16); parent.Children.Add(card);
    }
    private static void AddSpace(Panel parent, double height) => parent.Children.Add(new Border { Height = height });
    private static void Empty(Panel parent, string title, string subtitle)
    { var block = Text(title, 14, "#6F6680", true); block.Margin = new Thickness(0, 10, 0, 7); parent.Children.Add(block); parent.Children.Add(Text(subtitle, 12, "#97909F")); }
    private void EventRow(Panel parent, Appointment item)
    {
        var row = new Grid { Margin = new Thickness(0, 8, 0, 10) }; row.ColumnDefinitions.Add(new() { Width = new GridLength(56) }); row.ColumnDefinitions.Add(new());
        row.Children.Add(Text(item.AllDay ? "DIA\nTODO" : item.Start.ToLocalTime().ToString("HH:mm"), 12, "#8A72B4", true));
        var stack = Stack(); stack.Children.Add(Text(item.Title, 13, bold: true)); stack.Children.Add(Text((item.Source == "google" ? "Google Agenda" : "Neste computador") + (item.AllDay ? "" : " · até " + item.End.ToLocalTime().ToString("HH:mm")), 10, "#9B93A6")); Grid.SetColumn(stack, 1); row.Children.Add(stack); parent.Children.Add(row);
    }
    private void TaskRow(Panel parent, Todo task)
    {
        var row = new DockPanel { Margin = new Thickness(0, 3, 0, 5) };
        var check = new CheckBox { Margin = new Thickness(0, 6, 10, 0), VerticalAlignment = VerticalAlignment.Top, ToolTip = "Concluir tarefa" };
        check.Checked += async (_, _) => { check.IsEnabled = false; await c.CompleteTaskAsync(task); check.IsEnabled = true; if (c.Tasks.Any(t => t.Id == task.Id && !t.Done)) check.IsChecked = false; };
        row.Children.Add(check); var stack = Stack(); stack.Children.Add(Text(task.Title, 13));
        string due = task.Due is null ? "Sem prazo" : task.Due.Value == DateOnly.FromDateTime(DateTime.Today) ? "Hoje" : task.Due.Value.ToString("dd/MM");
        bool overdue = task.Due < DateOnly.FromDateTime(DateTime.Today);
        stack.Children.Add(Text((overdue ? "Atrasada · " : "") + due + " · " + (task.ListId is null ? "Local" : "Google Tasks"), 10, overdue ? "#B27B62" : "#A099AA")); row.Children.Add(stack); parent.Children.Add(row);
    }
    private void TasksPage()
    {
        var top = Stack(); top.Children.Add(Text("Tire da cabeça. Coloque na lista.", 16, bold: true)); var add = Action("＋  Nova tarefa local", NewTask, true); add.HorizontalAlignment = HorizontalAlignment.Left; add.Margin = new Thickness(0, 14, 0, 0); top.Children.Add(add); ContentPanel.Children.Add(Card(top));
        var list = Stack(); var pending = c.Tasks.Where(t => !t.Done).OrderBy(t => t.Due ?? DateOnly.MaxValue).ToList();
        if (pending.Count == 0) Empty(list, "Sua lista está livre.", "Novas tarefas locais e do Google Tasks aparecerão aqui.");
        foreach (var task in pending) TaskRow(list, task); ContentPanel.Children.Add(Card(list));
        ContentPanel.Children.Add(Text("As tarefas criadas aqui ficam neste computador. Tarefas do Google Tasks podem ser concluídas pelo Pingo. O Google informa o dia de vencimento, sem horário.", 12, "#92889E"));
    }
    private void CalendarPage()
    {
        ContentPanel.Children.Add(Text("Seus próximos 30 dias · agenda principal do Google + compromissos locais", 13, "#898092")); AddSpace(ContentPanel, 18);
        var upcoming = c.Events.Where(e => e.End > DateTimeOffset.Now && e.Start < DateTimeOffset.Now.AddDays(30)).ToList();
        if (upcoming.Count == 0) { var empty = Stack(); Empty(empty, "Espaço para o que vem pela frente.", "Adicione um compromisso ou conecte o Google Agenda."); ContentPanel.Children.Add(Card(empty)); }
        foreach (var group in upcoming.GroupBy(e => e.Start.ToLocalTime().Date))
        {
            var stack = Stack(); stack.Children.Add(Text(group.Key.ToString("dddd, dd 'de' MMMM", Pt), 14, "#8A72B4", true)); AddSpace(stack, 12);
            foreach (var item in group) EventRow(stack, item); ContentPanel.Children.Add(Card(stack));
        }
    }
    private void MailPage()
    {
        var intro = Stack(); intro.Children.Add(Text("O que chegou na sua caixa de entrada", 17, bold: true)); AddSpace(intro, 9); intro.Children.Add(Text("Mostro até 50 e-mails não lidos, com remetente e assunto. A primeira atualização não dispara avisos para mensagens antigas.", 13, "#8B8197")); ContentPanel.Children.Add(Card(intro));
        if (!c.Google.Connected) { ConnectCard(); return; }
        var list = Stack();
        if (c.Mail.Count == 0) Empty(list, c.MailFresh ? "Caixa de entrada em dia." : "Aguardando atualização.", c.MailFresh ? "Não encontrei e-mails não lidos na sua caixa de entrada." : "Os e-mails aparecerão depois da sincronização.");
        foreach (var mail in c.Mail)
        {
            var row = Stack(); row.Children.Add(Text(mail.Sender, 12, "#93859E")); AddSpace(row, 5); row.Children.Add(Text(string.IsNullOrWhiteSpace(mail.Subject) ? "(sem assunto)" : mail.Subject, 14, bold: true));
            var open = Action("Abrir no Gmail ↗", () => Controller.OpenUrl("https://mail.google.com/mail/u/?authuser=" + Uri.EscapeDataString(c.Email) + "#inbox/" + Uri.EscapeDataString(mail.Id))); open.FontSize = 11; open.Padding = new Thickness(10, 6, 10, 6); open.HorizontalAlignment = HorizontalAlignment.Left; open.Margin = new Thickness(0, 10, 0, 8); row.Children.Add(open);
            list.Children.Add(new Border { Child = row, BorderBrush = Color("#F0EBF5"), BorderThickness = new Thickness(0, 0, 0, 1), Padding = new Thickness(0, 12, 0, 6) });
        }
        ContentPanel.Children.Add(Card(list));
    }
    private void ActivityPage()
    {
        var list = Stack(); list.Children.Add(Text("Os recados que deixei para você", 17, bold: true)); AddSpace(list, 14);
        if (c.History.Count == 0) Empty(list, "Ainda sem recados nesta sessão.", "Resumos, e-mails e lembretes aparecem aqui quando forem avisados.");
        foreach (var item in c.History) { list.Children.Add(Text(item.Title, 14, "#7459DA", true)); var body = Text(item.Body, 13, "#877C92"); body.Margin = new Thickness(0, 6, 0, 22); list.Children.Add(body); }
        ContentPanel.Children.Add(Card(list));
    }
    private void ConnectCard()
    {
        var stack = Stack(); stack.Children.Add(Text("Vamos conectar sua rotina?", 16, bold: true)); AddSpace(stack, 8); stack.Children.Add(Text("Uma conexão Google reúne Gmail, Agenda e Tasks. O login acontece no seu navegador.", 13, "#8B8197")); var button = Action("Configurar minha conta", () => { ContentPanel.Tag = null; SelectPage("Ajustes"); }, true); button.HorizontalAlignment = HorizontalAlignment.Left; button.Margin = new Thickness(0, 16, 0, 0); stack.Children.Add(button); ContentPanel.Children.Add(Card(stack));
    }
    private void SettingsPage()
    {
        var settings = c.State.Settings; var routine = Stack(); routine.Children.Add(Text("Do seu jeito", 18, bold: true)); AddSpace(routine, 16);
        routine.Children.Add(Text("Resumo diário (horário deste Windows)", 12, "#8B8197")); var time = new TextBox { Text = settings.BriefingTime, MaxLength = 5, Width = 110, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 7, 0, 15) }; routine.Children.Add(time);
        routine.Children.Add(Text("Lembrete antes de cada compromisso", 12, "#8B8197")); var lead = new ComboBox { ItemsSource = new[] { 5, 10, 15, 30, 45, 60 }, SelectedItem = settings.ReminderMinutes, Width = 110, HorizontalAlignment = HorizontalAlignment.Left, Padding = new Thickness(8), Margin = new Thickness(0, 7, 0, 10) }; routine.Children.Add(lead);
        var voice = new CheckBox { Content = "Ler avisos em voz alta (voz instalada no Windows)", IsChecked = settings.Voice }; var mail = new CheckBox { Content = "Avisar sobre novos e-mails não lidos", IsChecked = settings.MailAlerts }; var pause = new CheckBox { Content = "Pausar todos os avisos", IsChecked = settings.Paused }; routine.Children.Add(voice); routine.Children.Add(mail); routine.Children.Add(pause);
        bool initiallyStartup = WindowsStartup.Enabled;
        var startup = new CheckBox { Content = "Iniciar o Pingo ao entrar no Windows", IsChecked = initiallyStartup }; routine.Children.Add(startup);
        var validation = Text("", 12, "#A86954"); routine.Children.Add(validation);
        var save = Action("Salvar preferências", () =>
        {
            if (!TimeOnly.TryParseExact(time.Text, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) { validation.Text = "Use um horário como 08:00 ou 09:30."; return; }
            try { if ((startup.IsChecked == true) != initiallyStartup) { WindowsStartup.Set(startup.IsChecked == true); initiallyStartup = startup.IsChecked == true; } }
            catch (Exception ex) { validation.Text = "Não consegui alterar a inicialização: " + Controller.Friendly(ex); return; }
            settings.BriefingTime = time.Text; settings.ReminderMinutes = lead.SelectedItem is int n ? n : 30; settings.Voice = voice.IsChecked == true; settings.MailAlerts = mail.IsChecked == true; settings.Paused = pause.IsChecked == true; c.Save(); validation.Foreground = Color("#3A9876"); validation.Text = "Preferências salvas.";
        }, true); save.HorizontalAlignment = HorizontalAlignment.Left; save.Margin = new Thickness(0, 12, 0, 0); routine.Children.Add(save); ContentPanel.Children.Add(Card(routine));
        var google = Stack(); google.Children.Add(Text("Sua conta Google", 18, bold: true)); AddSpace(google, 10);
        google.Children.Add(Text(c.Google.Connected ? "Conectado. A autorização está protegida pelo seu usuário do Windows." : "Para conectar este aplicativo pessoal, importe a credencial OAuth do seu projeto Google. Não é a senha da sua conta.", 13, "#8B8197")); AddSpace(google, 14);
        google.Children.Add(Text("1. Ative Gmail API, Google Calendar API e Tasks API no Google Cloud.\n2. Configure o Google Auth Platform e adicione seu e-mail como usuário de teste.\n3. Crie um cliente OAuth do tipo “Aplicativo para computador” e baixe o JSON.\n4. Importe o JSON abaixo e entre com sua conta Google.", 12, "#8B8197")); AddSpace(google, 15);
        var row = new WrapPanel();
        row.Children.Add(Action("Guia de conexão ↗", () => Controller.OpenUrl("https://developers.google.com/workspace/calendar/api/quickstart/dotnet")));
        row.Children.Add(Action("Importar JSON", () =>
        {
            if (!c.CanChangeAccount) { c.UpdateStatus("Espere a atualização ou o login terminar."); return; }
            var dialog = new Microsoft.Win32.OpenFileDialog { Filter = "Credenciais Google (*.json)|*.json", Title = "Escolha a credencial OAuth Desktop do Google" };
            if (dialog.ShowDialog(this) == true)
                try { if (c.Google.Connected) c.Disconnect(); c.Google.ImportCredentials(System.IO.File.ReadAllText(dialog.FileName)); c.UpdateStatus("Credencial importada. Clique em Entrar com Google."); ContentPanel.Tag = null; Refresh(); }
                catch (Exception ex) { c.UpdateStatus("Não consegui importar. " + Controller.Friendly(ex)); }
        }));
        var connect = AsyncAction(c.Google.Connected ? "Reconectar Google" : "Entrar com Google", async () => { await c.ConnectAsync(); ContentPanel.Tag = null; Refresh(); }, true); connect.IsEnabled = c.Google.Configured; row.Children.Add(connect); google.Children.Add(row); AddSpace(google, 10);
        if (c.Google.Connected) { var disconnect = Action("Desconectar deste computador", () => { c.Disconnect(); ContentPanel.Tag = null; Refresh(); }); disconnect.HorizontalAlignment = HorizontalAlignment.Left; google.Children.Add(disconnect); }
        AddSpace(google, 12); google.Children.Add(Text("Leitura dos cabeçalhos do Gmail; leitura e criação de eventos; leitura e conclusão de tarefas. Desconectar remove a autorização local. Você também pode revogar o acesso nas configurações da sua conta Google.", 11, "#9B92A5")); ContentPanel.Children.Add(Card(google));
        ContentPanel.Children.Add(Text("O pet precisa estar aberto, com o computador ligado e sem suspensão. Ao retomar, ele verifica os compromissos que ainda não começaram. Você pode ativar a inicialização com o Windows acima.", 12, "#92889E"));
    }
    private void ShowSummary() { var dialog = new FormWindow("Seu dia, com calma.", this); dialog.Body.Children.Add(Text(c.Summary, 15, "#776682")); dialog.AddButton("Tudo certo", () => dialog.Close(), true); dialog.ShowDialog(); }
    public void NewTask()
    {
        var dialog = new FormWindow("Uma coisa para fazer", this); var title = dialog.Field("O que você quer resolver?", ""); var date = dialog.Date("Para quando?", DateTime.Today); var noDue = new CheckBox { Content = "Sem prazo definido" }; dialog.Body.Children.Add(noDue);
        dialog.AddButton("Adicionar tarefa", () => { if (string.IsNullOrWhiteSpace(title.Text)) { dialog.Error.Text = "Escreva um título para a tarefa."; return; } c.AddTask(title.Text.Trim(), noDue.IsChecked == true ? null : DateOnly.FromDateTime(date.SelectedDate ?? DateTime.Today)); dialog.Close(); }, true); dialog.ShowDialog();
    }
    public void NewEvent(string titleValue = "", DateTimeOffset? when = null)
    {
        var whenLocal = (when ?? DateTimeOffset.Now.AddHours(1)).ToLocalTime(); var dialog = new FormWindow("Um novo compromisso", this);
        var title = dialog.Field("Nome do compromisso", titleValue); var date = dialog.Date("Data", whenLocal.Date); var time = dialog.Field("Horário (HH:mm)", whenLocal.ToString("HH:mm")); var duration = dialog.Field("Duração em minutos", "60");
        var target = new CheckBox { Content = c.Google.Connected ? "Salvar no Google Agenda" : "Conecte o Google para salvar também na sua agenda", IsChecked = c.Google.Connected, IsEnabled = c.Google.Connected }; dialog.Body.Children.Add(target);
        dialog.Body.Children.Add(Text("Aviso " + c.State.Settings.ReminderMinutes + " minutos antes. Horários seguem o fuso deste Windows.", 12, "#9B92A5"));
        string requestId = Guid.NewGuid().ToString("N");
        dialog.AddAsyncButton("Salvar compromisso", async () =>
        {
            if (string.IsNullOrWhiteSpace(title.Text)) { dialog.Error.Text = "Dê um nome ao compromisso."; return; }
            if (date.SelectedDate is null || !TimeOnly.TryParseExact(time.Text, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var clock) || !int.TryParse(duration.Text, out int minutes) || minutes < 1 || minutes > 10080) { dialog.Error.Text = "Confira a data, o horário e a duração (1 a 10.080 minutos)."; return; }
            DateTime local = DateTime.SpecifyKind(date.SelectedDate.Value.Date.Add(clock.ToTimeSpan()), DateTimeKind.Unspecified);
            if (TimeZoneInfo.Local.IsInvalidTime(local)) { dialog.Error.Text = "Esse horário não existe neste fuso. Escolha outro."; return; }
            var start = new DateTimeOffset(local, TimeZoneInfo.Local.GetUtcOffset(local));
            if (start <= DateTimeOffset.Now) { dialog.Error.Text = "Escolha um horário no futuro."; return; }
            bool conflict = c.Events.Any(e => e.Start < start.AddMinutes(minutes) && e.End > start);
            if (conflict && MessageBox.Show(dialog, "Já existe um compromisso nesse horário. Deseja salvar mesmo assim?", "Horários sobrepostos", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            await c.SaveEventAsync(title.Text.Trim(), start, start.AddMinutes(minutes), target.IsChecked == true, requestId); dialog.Close();
        }); dialog.ShowDialog();
    }
    private void CreateEvent(object sender, RoutedEventArgs e) => NewEvent();
    private async void SyncGoogle(object sender, RoutedEventArgs e) => await c.SyncAsync();
    private void HideWindow(object? sender, CancelEventArgs e) { if (!App.Exiting) { e.Cancel = true; Hide(); } }
}

public sealed class FormWindow : Window
{
    public StackPanel Body { get; } = new();
    public TextBlock Error { get; } = new() { Foreground = (Brush)new BrushConverter().ConvertFromString("#A86954")!, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 14, 0, 0) };
    private readonly WrapPanel buttons = new() { Margin = new Thickness(0, 18, 0, 0) };
    public FormWindow(string title, Window owner)
    {
        Style = (Style)FindResource(typeof(Window)); Title = title; Owner = owner; Width = 470; SizeToContent = SizeToContent.Height; MaxHeight = Math.Max(500, SystemParameters.WorkArea.Height - 40); ResizeMode = ResizeMode.NoResize; WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new StackPanel { Margin = new Thickness(28) }; root.Children.Add(new TextBlock { Text = title, FontSize = 24, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 20) }); root.Children.Add(Body); root.Children.Add(Error); root.Children.Add(buttons); Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }
    public TextBox Field(string label, string value)
    {
        Body.Children.Add(new TextBlock { Text = label, Foreground = Brushes.Gray, FontSize = 12 }); var field = new TextBox { Text = value, Margin = new Thickness(0, 7, 0, 16) }; Body.Children.Add(field); return field;
    }
    public DatePicker Date(string label, DateTime value)
    { Body.Children.Add(new TextBlock { Text = label, Foreground = Brushes.Gray, FontSize = 12 }); var date = new DatePicker { SelectedDate = value, Margin = new Thickness(0, 7, 0, 16), Padding = new Thickness(8) }; Body.Children.Add(date); return date; }
    public void AddButton(string label, Action action, bool primary = false)
    { var button = new Button { Content = label }; if (primary) button.Style = (Style)FindResource("Primary"); button.Click += (_, _) => action(); buttons.Children.Add(button); }
    public void AddAsyncButton(string label, Func<Task> action)
    { var button = new Button { Content = label, Style = (Style)FindResource("Primary") }; button.Click += async (_, _) => { button.IsEnabled = false; try { await action(); } catch (Exception ex) { Error.Text = Controller.Friendly(ex); } finally { button.IsEnabled = true; } }; buttons.Children.Add(button); }
}
