using Nodeable.ServiceDefaults;
using Nodeable.Worker;

// Host.CreateApplicationBuilder is the non-web twin of WebApplication.CreateBuilder: same DI, configuration and logging, but no HTTP server.
var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

// LEARN: LG-01 hosted-service | A BackgroundService registered with AddHostedService starts and stops with the process; in M2 this becomes the crawl queue consumer, a long-running loop that never touches HTTP requests
builder.Services.AddHostedService<CrawlWorker>();

var host = builder.Build();
host.Run();
