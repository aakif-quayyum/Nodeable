using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Nodeable.Api.Endpoints;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.People;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Api.Tests;

// FR-PERSON-01 over HTTP: the real Api and a real database. Nothing external is involved: the drawer reads the cache.
public sealed class PeopleEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    // The Api writes enums as camelCase text, which the default reader does not understand.
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private static async Task<(Guid Person, Guid Recording)> StoreAsync(WebApplicationFactory<Program> app)
    {
        var person = Guid.NewGuid();
        var recording = Guid.NewGuid();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NodeableDbContext>();

        db.People.Add(new Person { Mbid = person, Name = "Donald Glover", FetchedAt = DateTimeOffset.UtcNow });
        db.Recordings.Add(new Recording { Mbid = recording, Title = "Redbone", ArtistCredit = "Childish Gambino", FetchedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        db.Credits.Add(new Credit { PersonMbid = person, SubjectType = CreditSubjectType.Recording, SubjectMbid = recording, Role = CreditRole.Producer, Detail = string.Empty });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return (person, recording);
    }

    // WithWebHostBuilder starts a new host with a database of its own, so a test seeds and calls through the same one.
    private WebApplicationFactory<Program> App(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    [Fact]
    public async Task FR_PERSON_01_a_stored_person_has_a_profile_with_their_role_summary()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var (person, _) = await StoreAsync(app);
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/people/{person:D}", ct);
        var body = await response.Content.ReadFromJsonAsync<PersonProfile>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Name.Should().Be("Donald Glover");
        body.RecordingCount.Should().Be(1);
        body.Roles.Should().ContainSingle().Which.Role.Should().Be(CreditRole.Producer);
    }

    [Fact]
    public async Task FR_PERSON_01_the_credited_recordings_are_a_page_with_the_total()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var (person, recording) = await StoreAsync(app);
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/people/{person:D}/recordings?page=1&pageSize=10", ct);
        var body = await response.Content.ReadFromJsonAsync<PersonRecordingsPage>(_json, ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body!.Total.Should().Be(1);
        body.Items.Should().ContainSingle().Which.Mbid.Should().Be(recording);
    }

    [Fact]
    public async Task FR_PERSON_01_a_person_that_is_not_stored_is_404_with_a_problem_type()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        using var client = app.CreateClient();
        var unknown = Guid.NewGuid();

        var profile = await client.GetAsync($"/api/v1/people/{unknown:D}", ct);
        var recordings = await client.GetAsync($"/api/v1/people/{unknown:D}/recordings", ct);

        profile.StatusCode.Should().Be(HttpStatusCode.NotFound);
        recordings.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await profile.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.PersonNotFound);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=51")]
    public async Task FR_PERSON_01_a_page_outside_the_limits_is_400(string query)
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App();
        var (person, _) = await StoreAsync(app);
        using var client = app.CreateClient();

        var response = await client.GetAsync($"/api/v1/people/{person:D}/recordings?{query}", ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain(ProblemTypes.InvalidRequest);
    }

    [Fact]
    public async Task NFR_SEC_02_person_lookups_are_limited_per_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var app = App(("RateLimiting:PeoplePermitsPerMinute", "2"));
        var (person, _) = await StoreAsync(app);
        using var client = app.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync($"/api/v1/people/{person:D}", ct)).StatusCode);
        }

        statuses.Should().Equal(HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests);
    }
}
