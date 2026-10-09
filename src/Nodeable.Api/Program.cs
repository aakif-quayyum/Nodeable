using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Persistence;
using Nodeable.ServiceDefaults;

// LEARN: LG-01 top-level-statements | No Main method or class needed: the compiler wraps these statements in one, so this reads like a Node entry file (const app = express(); app.listen())
var builder = WebApplication.CreateBuilder(args);

// LEARN: LG-01 builder-pattern | Startup has two phases: register services on the builder, then Build() freezes the container and returns the app used to configure the request pipeline
builder.AddServiceDefaults();

// LEARN: LG-01 aspire-ef-integration | AddNpgsqlDbContext registers the DbContext with the connection string Aspire injected, plus a database health check and Npgsql traces and metrics, in one call
builder.AddNpgsqlDbContext<NodeableDbContext>(
    "nodeabledb",
    configureDbContextOptions: options => options.UseNodeableConventions());

var app = builder.Build();

// Development only: apply pending migrations at startup. Production runs migrations as a separate one-off step (spec section 13).
if (app.Environment.IsDevelopment())
{
    // LEARN: LG-01 service-scope | A DbContext is registered per request ("scoped"), and startup code has no request, so it opens its own scope; resolving a scoped service outside one is an error
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();
    await db.Database.MigrateAsync();
}

app.MapDefaultEndpoints();

app.Run();

// Exposes the compiler-generated Program class to the test project, so WebApplicationFactory<Program> can start this app in memory.
public partial class Program;
