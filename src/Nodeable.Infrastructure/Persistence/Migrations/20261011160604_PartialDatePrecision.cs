using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PartialDatePrecision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "date_precision",
                table: "releases",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "first_release_date_precision",
                table: "recordings",
                type: "text",
                nullable: true);

            // LEARN: LG-02 migration-backfill | A migration that adds a constraint must first repair rows that would break it; EF generates the schema change but cannot know what a sensible value is for existing data, so this SQL is written by hand
            // Dates stored before this migration were full dates, so their precision is 'day'. Without this, the
            // constraints below would fail on any database that already holds a dated row.
            migrationBuilder.Sql("UPDATE recordings SET first_release_date_precision = 'day' WHERE first_release_date IS NOT NULL;");
            migrationBuilder.Sql("UPDATE releases SET date_precision = 'day' WHERE date IS NOT NULL;");

            migrationBuilder.AddCheckConstraint(
                name: "ck_releases_date_has_precision",
                table: "releases",
                sql: "(date IS NULL) = (date_precision IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_releases_date_precision",
                table: "releases",
                sql: "date_precision IN ('year', 'month', 'day')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_recordings_first_release_date_has_precision",
                table: "recordings",
                sql: "(first_release_date IS NULL) = (first_release_date_precision IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_recordings_first_release_date_precision",
                table: "recordings",
                sql: "first_release_date_precision IN ('year', 'month', 'day')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_releases_date_has_precision",
                table: "releases");

            migrationBuilder.DropCheckConstraint(
                name: "ck_releases_date_precision",
                table: "releases");

            migrationBuilder.DropCheckConstraint(
                name: "ck_recordings_first_release_date_has_precision",
                table: "recordings");

            migrationBuilder.DropCheckConstraint(
                name: "ck_recordings_first_release_date_precision",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "date_precision",
                table: "releases");

            migrationBuilder.DropColumn(
                name: "first_release_date_precision",
                table: "recordings");
        }
    }
}
