namespace Nodeable.Api;

/// <summary>Settings for the status endpoints, bound from the "Status" configuration section.</summary>
public sealed class StatusOptions
{
    public const string SectionName = "Status";

    /// <summary>
    /// The operator's password for the private status endpoints (decision 0023). It is a secret: user secrets locally, the
    /// host's secret store in production, never the repository (NFR-SEC-01). When it is not set, the private endpoints
    /// answer 401 to everyone: they are closed by default, not open.
    /// </summary>
    public string? OperatorPassword { get; set; }
}
