using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PreviewMatchedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "matched_by",
                table: "previews",
                type: "text",
                nullable: false,
                defaultValueSql: "'isrc'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews",
                sql: "matched_by IN ('isrc', 'title_artist')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews");

            migrationBuilder.DropColumn(
                name: "matched_by",
                table: "previews");
        }
    }
}
