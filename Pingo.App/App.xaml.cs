using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Pingo.Desktop;
public partial class App : System.Windows.Application
{
    private Mutex? instance;
    private Controller? controller;
    public static bool Exiting { get; private set; }
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, error) =>
        {
            error.Handled = true;
            MessageBox.Show("O Pingo encontrou um problema: " + Controller.Friendly(error.Exception), "Pingo", MessageBoxButton.OK, MessageBoxImage.Information);
        };
        try
        {
            if (e.Args.Length >= 2 && e.Args[0] == "--verify-ui")
            {
                VerifyUi(Path.GetFullPath(e.Args[1])); Shutdown(); return;
            }
            instance = new Mutex(true, @"Local\Pingo.Personal.Desktop", out bool created);
            if (!created) { MessageBox.Show("O Pingo já está aberto. Use o ícone ao lado do relógio para abrir seu dia.", "Pingo"); Shutdown(); return; }
            string data = Path.Combine(AppContext.BaseDirectory, "data");
            controller = new(data);
            MainWindow = controller.Pet;
            await controller.StartAsync(e.Args.Contains("--quiet"));
        }
        catch (Exception ex) { MessageBox.Show("Não consegui iniciar o Pingo. " + Controller.Friendly(ex), "Pingo", MessageBoxButton.OK, MessageBoxImage.Error); Shutdown(1); }
    }
    private void VerifyUi(string output)
    {
        Directory.CreateDirectory(output);
        string testData = Path.Combine(output, "test-data-" + Guid.NewGuid().ToString("N"));
        using var c = new Controller(testData);
        var main = new MainWindow(c);
        Render((FrameworkElement)main.Content, 1100, 752, Path.Combine(output, "pingo-painel.png"));
        Render((FrameworkElement)c.Pet.Content, 300, 350, Path.Combine(output, "pingo-pet.png"));
        Render(new PetArtwork(), 128, 128, Path.Combine(output, "pingo-icon.png"));
        foreach (string page in new[] { "Tarefas", "Agenda", "E-mails", "Avisos", "Ajustes", "Hoje" })
        {
            main.SelectPage(page);
            Render((FrameworkElement)main.Content, 1100, 752, Path.Combine(output, "pingo-" + (page == "E-mails" ? "emails" : page.ToLowerInvariant()) + ".png"));
        }
        byte[] text = System.Text.Encoding.UTF8.GetBytes("Pingo OAuth protection test");
        byte[] protectedBytes = WindowsSecrets.Transform(text, true);
        if (protectedBytes.SequenceEqual(text) || !WindowsSecrets.Transform(protectedBytes, false).SequenceEqual(text)) throw new InvalidOperationException("DPAPI round trip failed.");
        c.AddTask("Tarefa de verificação local", DateOnly.FromDateTime(DateTime.Today));
        c.SaveEventAsync("Compromisso de verificação", DateTimeOffset.Now.AddHours(2), DateTimeOffset.Now.AddHours(3), false, Guid.NewGuid().ToString("N")).GetAwaiter().GetResult();
        c.CompleteTaskAsync(c.State.Todos.Last()).GetAwaiter().GetResult();
        var loaded = new Pingo.Core.StateStore(testData).Load();
        if (!loaded.Todos.Last().Done || loaded.Events.Count == 0) throw new InvalidOperationException("Local task/calendar persistence failed.");
        File.WriteAllText(Path.Combine(output, "ui-report.txt"), "PASS: 6 páginas WPF renderizadas; pet renderizado; DPAPI protege/recupera; tarefa criada/concluída; compromisso local salvo e recuperado.\n");
    }
    private static void Render(FrameworkElement content, int width, int height, string path)
    {
        content.Measure(new Size(width, height)); content.Arrange(new Rect(0, 0, width, height)); content.UpdateLayout();
        var bitmap = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32); bitmap.Render(content);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap)); using var stream = File.Create(path); encoder.Save(stream);
    }
    protected override void OnExit(ExitEventArgs e)
    {
        Exiting = true; controller?.Dispose(); instance?.Dispose(); base.OnExit(e);
    }
}
