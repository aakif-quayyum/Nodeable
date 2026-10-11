using Nodeable.Domain.Crawling;

namespace Nodeable.Domain.Tests;

public class CrawlRetryPolicyTests
{
    private static readonly CrawlRetryPolicy _policy = new(MaxAttempts: 5, BaseDelay: TimeSpan.FromSeconds(30), MaxDelay: TimeSpan.FromMinutes(15));

    [Theory]
    [InlineData(1, true)]
    [InlineData(4, true)]
    [InlineData(5, false)]
    [InlineData(6, false)]
    public void NFR_REL_01_a_job_is_retried_until_it_has_used_its_attempts(int attemptsMade, bool expected)
    {
        _policy.CanRetry(attemptsMade).Should().Be(expected);
    }

    [Theory]
    [InlineData(1, 30)]
    [InlineData(2, 60)]
    [InlineData(3, 120)]
    [InlineData(4, 240)]
    public void NFR_REL_01_the_wait_doubles_with_each_attempt(int attemptsMade, double expectedSeconds)
    {
        // Jitter 0.5 is the middle of the range, so no spread is applied.
        _policy.DelayAfter(attemptsMade, jitter: 0.5).TotalSeconds.Should().BeApproximately(expectedSeconds, 0.001);
    }

    [Fact]
    public void NFR_REL_01_the_wait_never_exceeds_the_maximum_plus_its_spread()
    {
        var delay = _policy.DelayAfter(attemptsMade: 20, jitter: 1);

        delay.Should().Be(TimeSpan.FromMinutes(15) * 1.2);
        _policy.DelayAfter(attemptsMade: 1000, jitter: 0.5).Should().Be(TimeSpan.FromMinutes(15));
    }

    [Fact]
    public void NFR_REL_01_jitter_spreads_the_wait_by_twenty_percent_either_way()
    {
        _policy.DelayAfter(2, jitter: 0).TotalSeconds.Should().BeApproximately(48, 0.001);
        _policy.DelayAfter(2, jitter: 1).TotalSeconds.Should().BeApproximately(72, 0.001);
    }

    [Theory]
    [InlineData(0, 0.5)]
    [InlineData(1, -0.1)]
    [InlineData(1, 1.1)]
    public void NFR_REL_01_nonsense_input_is_rejected(int attemptsMade, double jitter)
    {
        Action act = () => _policy.DelayAfter(attemptsMade, jitter);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }
}
