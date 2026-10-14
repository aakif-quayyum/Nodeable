using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DeezerPreviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "isrcs",
                table: "recordings",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.AddColumn<string>(
                name: "cover_md5",
                table: "previews",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "isrcs",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "cover_md5",
                table: "previews");
        }
    }
}
