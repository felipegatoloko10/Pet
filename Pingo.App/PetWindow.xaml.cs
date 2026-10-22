using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;

namespace Pingo.Desktop;
public partial class PetWindow : Window
{
    private readonly Controller controller;
    private readonly DispatcherTimer bubbleTimer = new() { Interval = TimeSpan.FromSeconds(18) };
    public PetWindow(Controller controller)
    {
        this.controller = controller; InitializeComponent();
        Loaded += (_, _) =>
        {
            var area = SystemParameters.WorkArea;
            Left = controller.State.Settings.PetLeft < 0 ? area.Right - Width - 22 : Math.Clamp(controller.State.Settings.PetLeft, area.Left, Math.Max(area.Left, area.Right - Width));
            Top = controller.State.Settings.PetTop < 0 ? area.Bottom - Height - 14 : Math.Clamp(controller.State.Settings.PetTop, area.Top, Math.Max(area.Top, area.Bottom - Height));
        };
        bubbleTimer.Tick += (_, _) => { bubbleTimer.Stop(); BubbleTitle.Text = controller.State.Settings.Paused ? "Um momento de silêncio." : "Estou por aqui."; BubbleText.Text = controller.State.Settings.Paused ? "Os avisos estão pausados. Clique com o botão direito para retomar." : "Digite “meu dia” ou clique para ver sua rotina."; };
    }
    public void Say(string title, string body)
    {
        BubbleTitle.Text = title; BubbleText.Text = body.Replace('\n', ' '); Bubble.ToolTip = title + "\n" + body;
        bubbleTimer.Stop(); bubbleTimer.Start();
    }
    private void OpenPanel(object sender, MouseButtonEventArgs e) => controller.ShowDashboard();
    private void MenuOpen(object sender, RoutedEventArgs e) => controller.ShowDashboard();
    private void MenuPause(object sender, RoutedEventArgs e) { controller.TogglePause(); Say("Avisos", controller.State.Settings.Paused ? "Pausados. Você pode continuar usando o painel." : "Retomados. Estou de olho nos próximos compromissos."); }
    private void MenuExit(object sender, RoutedEventArgs e) => System.Windows.Application.Current.Shutdown();
    private void DragPet(object sender, MouseButtonEventArgs e)
    {
        double x = Left, y = Top; DragMove();
        controller.State.Settings.PetLeft = Left; controller.State.Settings.PetTop = Top; controller.Save();
        if (Math.Abs(Left - x) + Math.Abs(Top - y) < 4) Dispatcher.BeginInvoke(new Action(() => controller.ShowDashboard()));
    }
    private void QuickKey(object sender, System.Windows.Input.KeyEventArgs e) { if (e.Key == Key.Enter) SendCommand(sender, e); }
    private void SendCommand(object sender, RoutedEventArgs e) { var command = QuickInput.Text; QuickInput.Clear(); controller.Command(command); }
}
