using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Nodeable.Api.Endpoints;
using Nodeable.Infrastructure.Persistence;
using Nodeable.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// LEARN: LG-01 aspire-ef-integration | AddNpgsqlDbContext registers the DbContext with the connection string Aspire injected, plus a database health check and Npgsql traces and metrics, in one call
builder.AddNpgsqlDbContext<NodeableDbContext>(
    "nodeabledb",
    configureDbContextOptions: options => options.UseNodeableConventions());

builder.Services.AddOpenApi();

// LEARN: LG-01 json-number-handling | ASP.NET's web defaults also accept numbers written as strings ("5"), and OpenAPI then describes every number as "integer or string"; Strict says numbers are numbers, so the generated TypeScript type is plain `number`
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);

var app = builder.Build();

// Development only: apply pending migrations at startup. Production runs migrations as a separate one-off step (spec section 13).
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();
    await db.Database.MigrateAsync();
}

app.MapDefaultEndpoints();

// Serves the OpenAPI document at /openapi/v1.json (spec section 9).
app.MapOpenApi();

app.MapStatusEndpoints();

app.Run();

// Exposes the compiler-generated Program class to the test project, so WebApplicationFactory<Program> can start this app in memory.
public partial class Program;
