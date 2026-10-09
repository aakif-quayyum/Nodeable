using Microsoft.EntityFrameworkCore;

namespace Nodeable.Infrastructure.Persistence;

public static class NodeableDbContextOptionsExtensions
{
    /// <summary>
    /// Conventions shared by the running app and the design-time tools that create migrations, so both
    /// build the same model: tables and columns are snake_case, as in spec section 8.
    /// </summary>
    public static DbContextOptionsBuilder UseNodeableConventions(this DbContextOptionsBuilder options)
        => options.UseSnakeCaseNamingConvention();
}
