using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Nodeable.ServiceDefaults;

// LEARN: LG-01 service-defaults | One shared project holds telemetry, health and resilience setup, so the Api and Worker call a single AddServiceDefaults() instead of repeating it
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    // LEARN: LG-01 extension-method | "this TBuilder builder" makes this a static method that appears on the builder itself (builder.AddServiceDefaults()); the "where" clause works like a TypeScript "extends" generic constraint
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        // LEARN: LG-01 http-defaults | ConfigureHttpClientDefaults attaches a retry, timeout and circuit-breaker pipeline to every HttpClient; the MusicBrainz client will replace it in M2 (NFR-RATE-03)
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        // LEARN: LG-01 otel-logs | Normal ILogger calls are forwarded to OpenTelemetry, so logs carry the trace and span ID of the request that wrote them (spec section 11)
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        // LEARN: LG-01 otel-signals | Metrics and traces are configured side by side; .NET calls a span an Activity and a tracer an ActivitySource, so AddSource opts a source in to export
        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation()
                .AddMeter("Nodeable.*"))
            .WithTracing(tracing => tracing
                .AddSource(builder.Environment.ApplicationName)
                .AddSource("Nodeable.*")
                .AddAspNetCoreInstrumentation(options =>
                    // Health probes would otherwise drown real traffic in the trace list.
                    options.Filter = context =>
                        !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                        && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath))
                .AddHttpClientInstrumentation());

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        // The AppHost injects OTEL_EXPORTER_OTLP_ENDPOINT, pointing at the Aspire dashboard locally.
        // In production the OpenTelemetry Collector's address goes in the same variable.
        var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
        if (!string.IsNullOrWhiteSpace(otlpEndpoint))
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        // LEARN: LG-01 health-checks | Tags split liveness ("is the process up?") from readiness ("are its dependencies up?"); later checks for PostgreSQL and Redis get no "live" tag
        // The ["live"] syntax is a C# 12 collection expression, much like a JavaScript array literal.
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Liveness is always exposed (container health checks need it, spec section 13).
        // The full readiness report stays development-only so production does not publish dependency status.
        app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
        {
            Predicate = registration => registration.Tags.Contains("live"),
        });

        if (app.Environment.IsDevelopment())
        {
            app.MapHealthChecks(HealthEndpointPath);
        }

        return app;
    }
}
