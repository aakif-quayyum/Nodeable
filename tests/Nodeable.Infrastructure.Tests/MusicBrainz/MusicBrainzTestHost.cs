using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.RateLimiting;
using StackExchange.Redis;
using WireMock.Server;

namespace Nodeable.Infrastructure.Tests.MusicBrainz;

/// <summary>
/// Builds the real MusicBrainz registration (the same <c>AddMusicBrainz()</c> the Worker calls) against a WireMock
/// server, so the tests exercise the actual HttpClient pipeline: User-Agent, retries and the rate gate.
/// </summary>
internal static class MusicBrainzTestHost
{
    public const string ContactUrl = "https://example.test/contact";

    public static string FixturePath(string name) => Path.Combine(AppContext.BaseDirectory, "Fixtures", "musicbrainz", name);

    public static string FixtureText(string name) => File.ReadAllText(FixturePath(name));

    /// <summary>
    /// A provider whose gate is <paramref name="gate"/>, or a no-op gate when none is given. Retry delays are short so
    /// the retry tests run in milliseconds; the number of retries and the backoff shape are the production ones.
    /// </summary>
    public static ServiceProvider Build(
        WireMockServer server,
        IRateGate? gate = null,
        IConnectionMultiplexer? redis = null,
        Dictionary<string, string?>? settings = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["MusicBrainz:BaseUrl"] = server.Url + "/ws/2/",
            ["MusicBrainz:ContactUrl"] = ContactUrl,
            ["MusicBrainz:RetryBaseDelay"] = "00:00:00.010",
        };
        foreach (var (key, value) in settings ?? [])
        {
            values[key] = value;
        }

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(values).Build());

        // The same default as Nodeable.ServiceDefaults gives every HttpClient: AddMusicBrainz has to replace it.
        services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

        services.AddMusicBrainz();

        if (redis is not null)
        {
            services.AddSingleton(redis);
        }

        if (gate is not null || redis is null)
        {
            services.AddKeyedSingleton<IRateGate>("musicbrainz", gate ?? new NoGate());
        }

        return services.BuildServiceProvider();
    }

    private sealed class NoGate : IRateGate
    {
        public string Resource => "none";

        public Task<TimeSpan> AcquireAsync(CancellationToken cancellationToken = default) => Task.FromResult(TimeSpan.Zero);
    }
}
