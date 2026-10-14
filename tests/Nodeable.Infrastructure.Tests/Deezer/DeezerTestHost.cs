using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Infrastructure.Deezer;
using Nodeable.Infrastructure.RateLimiting;
using WireMock.Server;

namespace Nodeable.Infrastructure.Tests.Deezer;

/// <summary>
/// The real <c>AddDeezer()</c> registration against a WireMock server, so the tests exercise the actual HttpClient
/// pipeline (retries and the gate), as <c>MusicBrainzTestHost</c> does for MusicBrainz.
/// </summary>
internal static class DeezerTestHost
{
    public static string FixtureText(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "deezer", name));

    /// <summary>The configuration keys that point the client at the fake. Retry delays are short so retry tests run in milliseconds.</summary>
    public static Dictionary<string, string?> Settings(WireMockServer server, Dictionary<string, string?>? extra = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Deezer:BaseUrl"] = server.Url + "/",
            ["Deezer:RetryBaseDelay"] = "00:00:00.010",
        };
        foreach (var (key, value) in extra ?? [])
        {
            values[key] = value;
        }

        return values;
    }

    /// <summary>A provider with only the Deezer client in it.</summary>
    public static ServiceProvider Build(WireMockServer server, IRateGate? gate = null, Dictionary<string, string?>? extraSettings = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(Settings(server, extraSettings)).Build());
        AddServices(services, gate);
        return services.BuildServiceProvider();
    }

    /// <summary>
    /// Adds the registration to a collection whose configuration the caller built (with <see cref="Settings"/> merged in).
    /// The gate is replaced after <c>AddDeezer</c>: the last registration of a key wins, so no Redis is needed.
    /// </summary>
    public static CountingGate AddServices(IServiceCollection services, IRateGate? gate = null)
    {
        var counting = new CountingGate();
        services.AddDeezer();
        services.AddKeyedSingleton<IRateGate>("deezer", gate ?? counting);
        return counting;
    }

    /// <summary>A gate that lets everything through and counts how often it was asked.</summary>
    public sealed class CountingGate : IRateGate
    {
        private int _acquired;

        public string Resource => "deezer";

        public int Acquired => _acquired;

        public Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _acquired);
            return Task.FromResult(TimeSpan.Zero);
        }
    }
}
