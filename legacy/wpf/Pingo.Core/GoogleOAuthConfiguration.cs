using System.Text.Json;

namespace Pingo.Core;

// Identifies the desktop application, never a user's authorization or refresh token.
// Desktop clients are public clients; PKCE protects each authorization attempt.
public sealed record GoogleOAuthConfiguration(string ClientId, string ClientSecret = "")
{
    public static GoogleOAuthConfiguration Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw Invalid();
            var client = root.TryGetProperty("installed", out var installed) ? installed : root;
            if (root.TryGetProperty("web", out _) || client.ValueKind != JsonValueKind.Object) throw Invalid();
            // Never accept a user's tokens as distributable application configuration.
            if (HasTokens(root) || HasTokens(client)) throw new InvalidDataException("A configuração do aplicativo não pode conter tokens de usuário.");
            if (!client.TryGetProperty("client_id", out var id) || id.ValueKind != JsonValueKind.String) throw Invalid();
            string clientId = id.GetString()!.Trim();
            const string suffix = ".apps.googleusercontent.com";
            string prefix = clientId.EndsWith(suffix, StringComparison.Ordinal) ? clientId[..^suffix.Length] : "";
            if (prefix.Length == 0 || prefix.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) throw Invalid();
            string secret = "";
            if (client.TryGetProperty("client_secret", out var value))
            {
                if (value.ValueKind != JsonValueKind.String) throw Invalid();
                secret = value.GetString() ?? "";
            }
            return new(clientId, secret);
        }
        catch (JsonException) { throw Invalid(); }
    }
    public GoogleCredentials CreateCredentials() => new() { ClientId = ClientId, ClientSecret = ClientSecret };
    private static bool HasTokens(JsonElement element) => element.EnumerateObject().Any(p =>
        p.Name.Equals("access_token", StringComparison.OrdinalIgnoreCase) || p.Name.Equals("refresh_token", StringComparison.OrdinalIgnoreCase) ||
        p.Name.Equals("id_token", StringComparison.OrdinalIgnoreCase) || p.Name.Equals("AccessToken", StringComparison.OrdinalIgnoreCase) || p.Name.Equals("RefreshToken", StringComparison.OrdinalIgnoreCase));
    private static InvalidDataException Invalid() => new("A configuração Google deve conter client_id e, quando fornecido pelo Google, client_secret de um cliente OAuth Desktop válido.");
}
