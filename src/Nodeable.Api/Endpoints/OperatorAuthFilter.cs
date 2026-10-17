using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Nodeable.Api.Endpoints;

namespace Nodeable.Api;

/// <summary>
/// HTTP Basic authentication for the private status endpoints (NFR-OBS-03, decision 0023): user <c>operator</c> and the
/// password in <see cref="StatusOptions.OperatorPassword"/>. It is enforced here, in code, so a test can prove an
/// unauthenticated request gets 401. There is no account system behind it.
/// </summary>
public sealed partial class OperatorAuthFilter(IOptions<StatusOptions> options, ILogger<OperatorAuthFilter> logger) : IEndpointFilter
{
    public const string UserName = "operator";

    public const string Challenge = "Basic realm=\"Nodeable status\", charset=\"UTF-8\"";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = options.Value.OperatorPassword;

        if (string.IsNullOrEmpty(expected))
        {
            LogNotConfigured(logger);
            return Unauthorized(http);
        }

        if (!TryReadCredentials(http.Request.Headers.Authorization.ToString(), out var user, out var password)
            || !Matches(user, password, expected))
        {
            return Unauthorized(http);
        }

        return await next(context);
    }

    /// <summary>Reads <c>Authorization: Basic base64(user:password)</c>. False for anything else.</summary>
    public static bool TryReadCredentials(string header, out string user, out string password)
    {
        user = password = string.Empty;
        const string scheme = "Basic ";
        if (!header.StartsWith(scheme, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header[scheme.Length..].Trim()));
            var colon = decoded.IndexOf(':', StringComparison.Ordinal);
            if (colon < 0)
            {
                return false;
            }

            user = decoded[..colon];
            password = decoded[(colon + 1)..];
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>True when both the user and the password are right, without telling a guess that is close from one that is far.</summary>
    public static bool Matches(string user, string password, string expectedPassword)
    {
        // LEARN: LG-04 constant-time-compare | Comparing secrets with == stops at the first different character, so how long it takes tells an attacker how much of a guess was right; hashing both sides to a fixed length and comparing with FixedTimeEquals takes the same time wherever they differ, and & (not &&) checks the user as well even when the password is wrong
        var userMatches = CryptographicOperations.FixedTimeEquals(Hash(user), Hash(UserName));
        var passwordMatches = CryptographicOperations.FixedTimeEquals(Hash(password), Hash(expectedPassword));
        return userMatches & passwordMatches;
    }

    private static byte[] Hash(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));

    private static ProblemHttpResult Unauthorized(HttpContext http)
    {
        http.Response.Headers.WWWAuthenticate = Challenge;
        return TypedResults.Problem(
            type: ProblemTypes.Unauthorized,
            title: "Sign-in required",
            detail: "The operator password is needed for this endpoint.",
            statusCode: StatusCodes.Status401Unauthorized);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Status:OperatorPassword is not set, so the private status endpoints refuse every request")]
    private static partial void LogNotConfigured(ILogger logger);
}
