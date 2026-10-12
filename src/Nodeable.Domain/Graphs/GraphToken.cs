using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace Nodeable.Domain.Graphs;

/// <summary>
/// The secret that authorises an anonymous graph (decision 0007). The browser keeps the token and sends it in
/// <c>X-Graph-Token</c>; the database keeps only its SHA-256 hash, so a leaked database gives nobody a usable token.
/// </summary>
public static class GraphToken
{
    /// <summary>32 random bytes are 256 bits, well past the 128 bits decision 0007 asks for.</summary>
    private const int ByteLength = 32;

    /// <summary>A new token, from the operating system's cryptographic random source, in URL-safe Base64 (43 characters).</summary>
    public static string Generate() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(ByteLength));

    /// <summary>The value stored in <c>graphs.anon_token_hash</c>: 64 lower-case hex characters.</summary>
    public static string Hash(string token)
    {
        ArgumentException.ThrowIfNullOrEmpty(token);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }

    /// <summary>True when <paramref name="token"/> is the token whose hash is <paramref name="storedHash"/>.</summary>
    public static bool Verify(string? token, string? storedHash)
    {
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(storedHash))
        {
            return false;
        }

        var presented = Encoding.UTF8.GetBytes(Hash(token));
        var expected = Encoding.UTF8.GetBytes(storedHash);

        // LEARN: LG-03 constant-time-compare | FixedTimeEquals always looks at every byte, so how long the check takes does not reveal how many leading characters of a guess were right; a plain == would stop at the first difference
        return CryptographicOperations.FixedTimeEquals(presented, expected);
    }
}
