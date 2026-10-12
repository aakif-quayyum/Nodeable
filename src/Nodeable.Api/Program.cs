using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Nodeable.Api.Endpoints;
using Nodeable.Api.RateLimiting;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Search;
using Nodeable.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// LEARN: LG-01 aspire-ef-integration | AddNpgsqlDbContext registers the DbContext with the connection string Aspire injected, plus a database health check and Npgsql traces and metrics, in one call
builder.AddNpgsqlDbContext<NodeableDbContext>(
    "nodeabledb",
    configureDbContextOptions: options => options.UseNodeableConventions());

// The rate gate that keeps every MusicBrainz request within 1 per second lives in Redis, so the Api joins the Worker in
// using it: a search is the one call the Api makes itself (decision 0018).
builder.AddRedisClient("redis");
builder.Services.AddMusicBrainz();
builder.Services.AddRecordingSearch();

// RFC 9457 Problem Details for every error the framework itself produces (404, 415, unhandled exceptions).
builder.Services.AddProblemDetails();
builder.Services.AddApiRateLimiting();

builder.Services.AddOpenApi();

// LEARN: LG-01 json-number-handling | ASP.NET's web defaults also accept numbers written as strings ("5"), and OpenAPI then describes every number as "integer or string"; Strict says numbers are numbers, so the generated TypeScript type is plain `number`
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);

// Enums travel as their names in camelCase ("complete", "musicBrainz"), which is also what the OpenAPI document and the
// generated TypeScript types say; the default would send the numbers 0, 1, 2.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

var app = builder.Build();

// Development only: apply pending migrations at startup. Production runs migrations as a separate one-off step (spec section 13).
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();
    await db.Database.MigrateAsync();
}

app.UseRateLimiter();

app.MapDefaultEndpoints();

// Serves the OpenAPI document at /openapi/v1.json (spec section 9).
app.MapOpenApi();

app.MapStatusEndpoints();
app.MapSearchEndpoints();

app.Run();

// Exposes the compiler-generated Program class to the test project, so WebApplicationFactory<Program> can start this app in memory.
public partial class Program;
