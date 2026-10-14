using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PreviewUserPick : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "picked_at",
                table: "previews",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews",
                sql: "matched_by IN ('isrc', 'title_artist', 'user_pick')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews");

            migrationBuilder.DropColumn(
                name: "picked_at",
                table: "previews");

            migrationBuilder.AddCheckConstraint(
                name: "ck_previews_matched_by",
                table: "previews",
                sql: "matched_by IN ('isrc', 'title_artist')");
        }
    }
}
