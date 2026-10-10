using Nodeable.ServiceDefaults;
using Nodeable.Worker;

// Host.CreateApplicationBuilder is the non-web twin of WebApplication.CreateBuilder: same DI, configuration and logging, but no HTTP server.
var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddHostedService<CrawlWorker>();

var host = builder.Build();
host.Run();
