using Nodeable.Domain.Enums;
using Nodeable.Domain.Mapping;

namespace Nodeable.Domain.Tests;

public class CreditsStatusCalculatorTests
{
    [Fact]
    public void FR_GRAPH_04_a_recording_with_no_credits_has_status_none()
    {
        CreditsStatusCalculator.Calculate([]).Should().Be(CreditsStatus.None);
    }

    [Fact]
    public void FR_GRAPH_04_a_producer_and_a_songwriter_make_the_credits_complete()
    {
        CreditsStatusCalculator.Calculate([CreditRole.Producer, CreditRole.Songwriter]).Should().Be(CreditsStatus.Complete);
    }

    [Theory]
    [InlineData(CreditRole.Producer)]
    [InlineData(CreditRole.Songwriter)]
    public void FR_GRAPH_04_only_a_producer_or_only_a_songwriter_is_partial(CreditRole role)
    {
        CreditsStatusCalculator.Calculate([role]).Should().Be(CreditsStatus.Partial);
    }

    [Fact]
    public void FR_GRAPH_04_engineers_and_musicians_alone_do_not_make_credits_complete()
    {
        var roles = new[] { CreditRole.Engineering, CreditRole.Instrument, CreditRole.Vocal, CreditRole.Mixing, CreditRole.Other };

        CreditsStatusCalculator.Calculate(roles).Should().Be(CreditsStatus.Partial);
    }

    [Fact]
    public void FR_GRAPH_04_repeated_roles_count_once_and_order_does_not_matter()
    {
        var roles = new[] { CreditRole.Songwriter, CreditRole.Songwriter, CreditRole.Vocal, CreditRole.Producer, CreditRole.Producer };

        CreditsStatusCalculator.Calculate(roles).Should().Be(CreditsStatus.Complete);
    }
}
