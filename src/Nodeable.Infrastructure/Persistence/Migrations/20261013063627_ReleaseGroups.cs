using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReleaseGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "release_group_mbid",
                table: "releases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "release_group_secondary_types",
                table: "releases",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.AddColumn<string>(
                name: "release_group_type",
                table: "releases",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "releases",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "release_group_mbid",
                table: "releases");

            migrationBuilder.DropColumn(
                name: "release_group_secondary_types",
                table: "releases");

            migrationBuilder.DropColumn(
                name: "release_group_type",
                table: "releases");

            migrationBuilder.DropColumn(
                name: "status",
                table: "releases");
        }
    }
}
