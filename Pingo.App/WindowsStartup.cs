using System;
using System.IO;
using Microsoft.Win32;

namespace Pingo.Desktop;
public static class WindowsStartup
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public static bool Enabled
    {
        get { using var key = Registry.CurrentUser.OpenSubKey(RunKey); return key?.GetValue("Pingo") is string value && value.Contains(Path.Combine(AppContext.BaseDirectory, "Pingo.exe"), StringComparison.OrdinalIgnoreCase); }
    }
    public static void Set(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue("Pingo", "\"" + Path.Combine(AppContext.BaseDirectory, "Pingo.exe") + "\" --quiet");
        else key.DeleteValue("Pingo", false);
    }
}
