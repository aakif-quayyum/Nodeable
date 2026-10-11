using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.ServiceDefaults;
using Nodeable.Worker;

// Host.CreateApplicationBuilder is the non-web twin of WebApplication.CreateBuilder: same DI, configuration and logging, but no HTTP server.
var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

// The AppHost's WithReference(redis) provides ConnectionStrings__redis; AddRedisClient turns it into an
// IConnectionMultiplexer (plus a health check and tracing). The MusicBrainz rate gate keeps its state there.
builder.AddRedisClient("redis");

// Only the Worker talks to MusicBrainz (spec section 7), so the client and its shared rate gate are registered here.
builder.Services.AddMusicBrainz();

builder.Services.AddHostedService<CrawlWorker>();

var host = builder.Build();
host.Run();
