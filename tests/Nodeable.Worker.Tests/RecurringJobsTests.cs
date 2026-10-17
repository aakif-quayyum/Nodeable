using Hangfire;
using Hangfire.Common;
using Microsoft.Extensions.Options;
using Nodeable.Infrastructure.Refresh;

namespace Nodeable.Worker.Tests;

// NFR-REL-03: the Worker declares the cache refresh as a recurring Hangfire job when it starts. What the job does is
// tested in Nodeable.Infrastructure.Tests (StaleCacheRefresherTests); here only that it is scheduled, once, as configured.
public class RecurringJobsTests
{
    [Fact]
    public async Task NFR_REL_03_the_worker_registers_the_cache_refresh_under_one_id_with_the_configured_cron_in_utc()
    {
        var ct = TestContext.Current.CancellationToken;
        var manager = new FakeManager();
        var jobs = new RecurringJobs(manager, Options.Create(new RefreshOptions { Cron = "13 * * * *" }));

        await jobs.StartAsync(ct);

        var call = manager.Calls.Should().ContainSingle(c => c.Id == RecurringJobs.CacheRefreshId).Subject;
        call.Cron.Should().Be("13 * * * *");
        call.TimeZone.Should().Be(TimeZoneInfo.Utc);
        call.Job.Type.Should().Be<RefreshStaleCacheJob>();
        call.Job.Method.Name.Should().Be(nameof(RefreshStaleCacheJob.RunAsync));
    }

    [Fact]
    public async Task NFR_REL_03_starting_twice_updates_the_same_entry_instead_of_adding_another()
    {
        var ct = TestContext.Current.CancellationToken;
        var manager = new FakeManager();
        var jobs = new RecurringJobs(manager, Options.Create(new RefreshOptions()));

        await jobs.StartAsync(ct);
        await jobs.StartAsync(ct);

        manager.Calls.Select(c => c.Id).Distinct().Should().HaveCount(3, "AddOrUpdate is keyed by id, so a restart replaces the entries instead of adding more");
    }

    [Fact]
    public async Task NFR_OBS_02_the_worker_registers_the_rollup_housekeeping_to_run_every_minute()
    {
        var ct = TestContext.Current.CancellationToken;
        var manager = new FakeManager();

        await new RecurringJobs(manager, Options.Create(new RefreshOptions())).StartAsync(ct);

        var call = manager.Calls.Should().ContainSingle(c => c.Id == RecurringJobs.RollupMaintenanceId).Subject;
        call.Cron.Should().Be(Cron.Minutely());
        call.Job.Type.Should().Be<RollupMaintenanceJob>();
    }

    [Fact]
    public async Task NFR_OBS_04_the_worker_registers_the_slo_check_once_a_day_in_utc()
    {
        var ct = TestContext.Current.CancellationToken;
        var manager = new FakeManager();

        await new RecurringJobs(manager, Options.Create(new RefreshOptions())).StartAsync(ct);

        var call = manager.Calls.Should().ContainSingle(c => c.Id == RecurringJobs.SloCheckId).Subject;
        call.Cron.Should().Be("17 3 * * *");
        call.TimeZone.Should().Be(TimeZoneInfo.Utc);
        call.Job.Type.Should().Be<SloCheckJob>();
    }

    private sealed record Call(string Id, Job Job, string Cron, TimeZoneInfo TimeZone);

    private sealed class FakeManager : IRecurringJobManager
    {
        public List<Call> Calls { get; } = [];

        public void AddOrUpdate(string recurringJobId, Job job, string cronExpression, RecurringJobOptions options) =>
            Calls.Add(new Call(recurringJobId, job, cronExpression, options.TimeZone));

        public void Trigger(string recurringJobId) => throw new NotSupportedException();

        public void RemoveIfExists(string recurringJobId) => throw new NotSupportedException();
    }
}
