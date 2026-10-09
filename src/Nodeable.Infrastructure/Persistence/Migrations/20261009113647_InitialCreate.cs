using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Nodeable.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "crawl_jobs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    kind = table.Column<string>(type: "text", nullable: false),
                    target_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    priority = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    run_after = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    locked_by = table.Column<string>(type: "text", nullable: true),
                    locked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    traceparent = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_crawl_jobs", x => x.id);
                    table.CheckConstraint("ck_crawl_jobs_kind", "kind IN ('recording', 'work', 'release', 'preview', 'artist')");
                    table.CheckConstraint("ck_crawl_jobs_status", "status IN ('pending', 'running', 'done', 'failed')");
                });

            migrationBuilder.CreateTable(
                name: "graphs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: true),
                    anon_token_hash = table.Column<string>(type: "text", nullable: true),
                    name = table.Column<string>(type: "text", nullable: false),
                    is_public = table.Column<bool>(type: "boolean", nullable: false),
                    share_slug = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_graphs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "people",
                columns: table => new
                {
                    mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    sort_name = table.Column<string>(type: "text", nullable: true),
                    type = table.Column<string>(type: "text", nullable: true),
                    disambiguation = table.Column<string>(type: "text", nullable: true),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_people", x => x.mbid);
                });

            migrationBuilder.CreateTable(
                name: "recordings",
                columns: table => new
                {
                    mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    artist_credit = table.Column<string>(type: "text", nullable: false),
                    first_release_date = table.Column<DateOnly>(type: "date", nullable: true),
                    length_ms = table.Column<int>(type: "integer", nullable: true),
                    credits_status = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recordings", x => x.mbid);
                    table.CheckConstraint("ck_recordings_credits_status", "credits_status IN ('none', 'partial', 'complete')");
                });

            migrationBuilder.CreateTable(
                name: "releases",
                columns: table => new
                {
                    mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: true),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_releases", x => x.mbid);
                });

            migrationBuilder.CreateTable(
                name: "works",
                columns: table => new
                {
                    mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_works", x => x.mbid);
                });

            migrationBuilder.CreateTable(
                name: "credits",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    person_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_type = table.Column<string>(type: "text", nullable: false),
                    subject_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    detail = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    source = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_credits", x => x.id);
                    table.CheckConstraint("ck_credits_role", "role IN ('producer', 'songwriter', 'mixing', 'engineering', 'instrument', 'vocal', 'other')");
                    table.CheckConstraint("ck_credits_source", "source IN ('musicbrainz', 'discogs')");
                    table.CheckConstraint("ck_credits_subject_type", "subject_type IN ('recording', 'work', 'release')");
                    table.ForeignKey(
                        name: "fk_credits_people_person_mbid",
                        column: x => x.person_mbid,
                        principalTable: "people",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "graph_songs",
                columns: table => new
                {
                    graph_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recording_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    added_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_graph_songs", x => new { x.graph_id, x.recording_mbid });
                    table.ForeignKey(
                        name: "fk_graph_songs_graphs_graph_id",
                        column: x => x.graph_id,
                        principalTable: "graphs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_graph_songs_recordings_recording_mbid",
                        column: x => x.recording_mbid,
                        principalTable: "recordings",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "previews",
                columns: table => new
                {
                    recording_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    provider_track_id = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_previews", x => new { x.recording_mbid, x.provider });
                    table.CheckConstraint("ck_previews_provider", "provider IN ('deezer')");
                    table.ForeignKey(
                        name: "fk_previews_recordings_recording_mbid",
                        column: x => x.recording_mbid,
                        principalTable: "recordings",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recording_releases",
                columns: table => new
                {
                    recording_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    release_mbid = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recording_releases", x => new { x.recording_mbid, x.release_mbid });
                    table.ForeignKey(
                        name: "fk_recording_releases_recordings_recording_mbid",
                        column: x => x.recording_mbid,
                        principalTable: "recordings",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_recording_releases_releases_release_mbid",
                        column: x => x.release_mbid,
                        principalTable: "releases",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recording_works",
                columns: table => new
                {
                    recording_mbid = table.Column<Guid>(type: "uuid", nullable: false),
                    work_mbid = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recording_works", x => new { x.recording_mbid, x.work_mbid });
                    table.ForeignKey(
                        name: "fk_recording_works_recordings_recording_mbid",
                        column: x => x.recording_mbid,
                        principalTable: "recordings",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_recording_works_works_work_mbid",
                        column: x => x.work_mbid,
                        principalTable: "works",
                        principalColumn: "mbid",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_crawl_jobs_kind_target_mbid",
                table: "crawl_jobs",
                columns: new[] { "kind", "target_mbid" },
                unique: true,
                filter: "status IN ('pending', 'running')");

            migrationBuilder.CreateIndex(
                name: "ix_crawl_jobs_priority_run_after",
                table: "crawl_jobs",
                columns: new[] { "priority", "run_after" },
                descending: new[] { true, false },
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "ix_credits_person_mbid_subject_type_subject_mbid_role_detail",
                table: "credits",
                columns: new[] { "person_mbid", "subject_type", "subject_mbid", "role", "detail" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_credits_subject_type_subject_mbid",
                table: "credits",
                columns: new[] { "subject_type", "subject_mbid" });

            migrationBuilder.CreateIndex(
                name: "ix_graph_songs_recording_mbid",
                table: "graph_songs",
                column: "recording_mbid");

            migrationBuilder.CreateIndex(
                name: "ix_recording_releases_release_mbid",
                table: "recording_releases",
                column: "release_mbid");

            migrationBuilder.CreateIndex(
                name: "ix_recording_works_work_mbid",
                table: "recording_works",
                column: "work_mbid");

            migrationBuilder.CreateIndex(
                name: "ix_recordings_title",
                table: "recordings",
                column: "title")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            // LEARN: LG-01 raw-sql-migration | EF cannot model a SQL view, so the migration runs hand-written SQL: credits live at three levels (recording, work, release) and this view flattens them into "who is credited on this recording", which every graph feature reads (spec section 8)
            migrationBuilder.Sql("""
                CREATE VIEW recording_people AS
                SELECT c.subject_mbid AS recording_mbid, c.person_mbid, c.role, c.detail, 'recording' AS level
                FROM credits c WHERE c.subject_type = 'recording'
                UNION ALL
                SELECT rw.recording_mbid, c.person_mbid, c.role, c.detail, 'work'
                FROM recording_works rw JOIN credits c ON c.subject_type = 'work' AND c.subject_mbid = rw.work_mbid
                UNION ALL
                SELECT rr.recording_mbid, c.person_mbid, c.role, c.detail, 'release'
                FROM recording_releases rr JOIN credits c ON c.subject_type = 'release' AND c.subject_mbid = rr.release_mbid;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The view depends on credits and the link tables, so it must go first.
            migrationBuilder.Sql("DROP VIEW recording_people;");

            migrationBuilder.DropTable(
                name: "crawl_jobs");

            migrationBuilder.DropTable(
                name: "credits");

            migrationBuilder.DropTable(
                name: "graph_songs");

            migrationBuilder.DropTable(
                name: "previews");

            migrationBuilder.DropTable(
                name: "recording_releases");

            migrationBuilder.DropTable(
                name: "recording_works");

            migrationBuilder.DropTable(
                name: "people");

            migrationBuilder.DropTable(
                name: "graphs");

            migrationBuilder.DropTable(
                name: "releases");

            migrationBuilder.DropTable(
                name: "recordings");

            migrationBuilder.DropTable(
                name: "works");
        }
    }
}
