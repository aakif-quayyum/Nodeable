using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Deezer;
using Nodeable.Infrastructure.Graphs;
using Nodeable.Infrastructure.Ingestion;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.ServiceDefaults;
using Nodeable.Worker;

// Host.CreateApplicationBuilder is the non-web twin of WebApplication.CreateBuilder: same DI, configuration and logging, but no HTTP server.
var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

// The queue is a table in the same database the Api uses, so the Worker registers the same DbContext (the Api migrates it).
builder.AddNpgsqlDbContext<NodeableDbContext>(
    "nodeabledb",
    configureDbContextOptions: options => options.UseNodeableConventions());

// The AppHost's WithReference(redis) provides ConnectionStrings__redis; AddRedisClient turns it into an
// IConnectionMultiplexer (plus a health check and tracing). The MusicBrainz rate gate keeps its state there.
builder.AddRedisClient("redis");

// Only the Worker talks to MusicBrainz (spec section 7), so the client and its shared rate gate are registered here.
builder.Services.AddMusicBrainz();

// Deezer previews (FR-PREVIEW-01): the preview job looks a recording up by ISRC through Deezer's own shared gate.
builder.Services.AddDeezer();

// The queue, its runner and its settings, and the handlers that turn recording, work and release jobs into credits.
builder.Services.AddCrawling();
builder.Services.AddIngestion();

// After each job, tell the browsers watching the songs it concerned: the Worker has no hub of its own, it sends
// through the Redis backplane to the one the Api hosts (spec section 7, step 6).
builder.Services.AddGraphEvents();
builder.Services.AddGraphJobEvents();

builder.Services.AddHostedService<CrawlWorker>();

var host = builder.Build();
host.Run();
