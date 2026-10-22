using System.IO;
using Pingo.Core;

namespace Pingo.Desktop;

public static class GoogleLogin
{
    public const string MissingConfiguration = "O login Google ainda não foi habilitado nesta versão. É preciso registrar o Pingo no Google uma única vez e gerar a versão com essa configuração. As tarefas e a agenda locais continuam disponíveis.";
    public static GoogleOAuthConfiguration? LoadApplicationConfiguration()
    {
        // Compile-time resource: no user file picker and no plaintext tokens in the installation folder.
        using var stream = typeof(GoogleLogin).Assembly.GetManifestResourceStream("Pingo.GoogleOAuth.json");
        if (stream is null) return null;
        using var reader = new StreamReader(stream);
        return GoogleOAuthConfiguration.Parse(reader.ReadToEnd());
    }
}
