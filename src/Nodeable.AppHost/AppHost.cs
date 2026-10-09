// LEARN: LG-01 apphost | The AppHost is a C# program that describes the whole system (services, databases, wiring) and launches it; the Docker Compose file plus the process manager you would otherwise write, but type-checked
var builder = DistributedApplication.CreateBuilder(args);

// LEARN: LG-01 project-resource | Projects.Nodeable_Api is a type Aspire generates from the ProjectReference, so a renamed or deleted project is a compile error here, not a runtime surprise
var api = builder.AddProject<Projects.Nodeable_Api>("api")
    .WithHttpHealthCheck("/health");

builder.AddProject<Projects.Nodeable_Worker>("worker");

builder.Build().Run();
