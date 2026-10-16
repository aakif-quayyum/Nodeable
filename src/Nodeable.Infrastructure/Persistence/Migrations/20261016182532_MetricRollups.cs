using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MetricRollups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "metric_rollups",
                columns: table => new
                {
                    resolution = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    bucket_start = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    metric = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    dimension = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    count = table.Column<long>(type: "bigint", nullable: false),
                    sum = table.Column<double>(type: "double precision", nullable: true),
                    min = table.Column<double>(type: "double precision", nullable: true),
                    max = table.Column<double>(type: "double precision", nullable: true),
                    last = table.Column<double>(type: "double precision", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_metric_rollups", x => new { x.resolution, x.bucket_start, x.metric, x.dimension });
                    table.CheckConstraint("ck_metric_rollups_resolution", "resolution IN ('1m', '5m')");
                });

            migrationBuilder.CreateTable(
                name: "slo_checks",
                columns: table => new
                {
                    checked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    slo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    window_days = table.Column<int>(type: "integer", nullable: false),
                    observed = table.Column<double>(type: "double precision", nullable: true),
                    target = table.Column<double>(type: "double precision", nullable: false),
                    breached = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_slo_checks", x => new { x.checked_at, x.slo });
                });

            migrationBuilder.CreateIndex(
                name: "ix_metric_rollups_resolution_metric_bucket_start",
                table: "metric_rollups",
                columns: new[] { "resolution", "metric", "bucket_start" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "metric_rollups");

            migrationBuilder.DropTable(
                name: "slo_checks");
        }
    }
}
