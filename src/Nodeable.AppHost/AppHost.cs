var builder = DistributedApplication.CreateBuilder(args);

// The Postgres server container is the resource; "nodeabledb" is one database inside it (decision 0011).
//
// The data lives in a named Docker volume, so the graph and the crawled MusicBrainz data survive a restart: refetching
// costs a second per request. A volume keeps the password the server was first started with, so the password has to be
// stable too. Aspire generates one and remembers it in this project's user secrets (Parameters:postgres-password), never
// in the repository (NFR-SEC-01); the services get it through their connection strings.
// To start again from an empty database, see "Resetting the local database" in the README.
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume("nodeable-postgres-data");
var nodeableDb = postgres.AddDatabase("nodeabledb");

// Redis holds the shared MusicBrainz rate gate (Worker and Api, from M2/M3) and, in M3, the SignalR backplane.
var redis = builder.AddRedis("redis");

// LEARN: LG-01 service-wiring | WithReference injects the connection string as configuration (ConnectionStrings__nodeabledb) and WaitFor holds the service back until the database reports healthy
var api = builder.AddProject<Projects.Nodeable_Api>("api")
    .WithReference(nodeableDb)
    .WaitFor(nodeableDb)
    // Search asks MusicBrainz through the same Redis rate gate the Worker uses (decision 0018).
    .WithReference(redis)
    .WaitFor(redis)
    .WithHttpHealthCheck("/health");

// The address people open (and bookmark) is fixed at 5173, Vite's own default. Aspire's proxy listens there and forwards
// to the port it hands Vite as PORT (see web/vite.config.ts), so the dashboard link and the bookmark are the same.
builder.AddViteApp("web", "../../web")
    .WithEndpoint("http", endpoint => endpoint.Port = 5173)
    .WithReference(api)
    .WaitFor(api);

// The Api migrates the database in Development, so the Worker waits for the Api rather than racing it.
builder.AddProject<Projects.Nodeable_Worker>("worker")
    .WithReference(nodeableDb)
    .WithReference(redis)
    .WaitFor(api)
    .WaitFor(redis);

builder.Build().Run();
