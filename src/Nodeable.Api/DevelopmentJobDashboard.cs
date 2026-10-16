using System.Reflection;
using Hangfire;
using Hangfire.PostgreSql;

namespace Nodeable.Api;

/// <summary>
/// The Hangfire dashboard (decision 0028, D4): served by the Api in Development only and never in production. The Api is
/// a Hangfire client here and runs no jobs: the server is in the Worker, which also creates the storage schema, so the
/// Api opens no connection at startup and the dashboard works once the Worker has run once.
/// </summary>
public static class DevelopmentJobDashboard
{
    public const string Path = "/hangfire";

    // The build-time OpenAPI generator runs this startup code with no configuration; it has no database to point at.
    private static bool IsOpenApiGenerator => Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";

    public static IServiceCollection AddDevelopmentJobDashboard(this WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment() || IsOpenApiGenerator)
        {
            return builder.Services;
        }

        var connection = builder.Configuration.GetConnectionString("nodeabledb")
            ?? throw new InvalidOperationException("The connection string \"nodeabledb\" is missing.");

        return builder.Services.AddHangfire(configuration => configuration
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(
                options => options.UseNpgsqlConnection(connection),
                new PostgreSqlStorageOptions { SchemaName = "hangfire", PrepareSchemaIfNecessary = false }));
    }

    public static IEndpointRouteBuilder MapDevelopmentJobDashboard(this WebApplication app)
    {
        // LEARN: LG-04 dev-only-endpoint | The dashboard is mapped only when the environment is Development, so in production the route does not exist at all (a request gets a 404) rather than existing behind a password; Hangfire's default also lets only local requests in
        if (app.Environment.IsDevelopment() && !IsOpenApiGenerator)
        {
            app.MapHangfireDashboard(Path, new DashboardOptions { DashboardTitle = "Nodeable jobs" });
        }

        return app;
    }
}
