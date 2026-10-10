var builder = DistributedApplication.CreateBuilder(args);

// The Postgres server container is the resource; "nodeabledb" is one database inside it.
// Aspire generates the password and passes it to the services, so there is nothing to configure or commit (NFR-SEC-01).
var postgres = builder.AddPostgres("postgres");
var nodeableDb = postgres.AddDatabase("nodeabledb");

// Redis arrives now so the topology matches spec section 7; it is used from M2 (rate gate) and M3 (SignalR backplane).
var redis = builder.AddRedis("redis");

// LEARN: LG-01 service-wiring | WithReference injects the connection string as configuration (ConnectionStrings__nodeabledb) and WaitFor holds the service back until the database reports healthy
var api = builder.AddProject<Projects.Nodeable_Api>("api")
    .WithReference(nodeableDb)
    .WaitFor(nodeableDb)
    .WithHttpHealthCheck("/health");

builder.AddViteApp("web", "../../web")
    .WithReference(api)
    .WaitFor(api);

// The Api migrates the database in Development, so the Worker waits for the Api rather than racing it.
builder.AddProject<Projects.Nodeable_Worker>("worker")
    .WithReference(nodeableDb)
    .WithReference(redis)
    .WaitFor(api)
    .WaitFor(redis);

builder.Build().Run();
