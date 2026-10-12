using Nodeable.Domain.Graphs;

namespace Nodeable.Domain.Tests;

public class GraphTokenTests
{
    // A method, not a pattern inside the lambda: the assertion takes an expression tree, which cannot hold an "is" pattern.
    private static bool IsUrlSafe(char c) => char.IsAsciiLetterOrDigit(c) || c == '-' || c == '_';

    [Fact]
    public void FR_GRAPH_01_a_new_token_is_43_url_safe_characters_and_never_repeats()
    {
        var tokens = Enumerable.Range(0, 200).Select(_ => GraphToken.Generate()).ToList();

        tokens.Should().OnlyContain(t => t.Length == 43);
        tokens.Should().OnlyContain(t => t.All(IsUrlSafe));
        tokens.Distinct().Should().HaveCount(tokens.Count);
    }

    [Fact]
    public void FR_GRAPH_01_the_stored_hash_is_64_hex_characters_and_is_not_the_token()
    {
        var token = GraphToken.Generate();

        var hash = GraphToken.Hash(token);

        hash.Should().MatchRegex("^[0-9a-f]{64}$");
        hash.Should().NotContain(token);
        GraphToken.Hash(token).Should().Be(hash, "the same token always gives the same hash");
    }

    [Fact]
    public void FR_GRAPH_01_the_known_sha256_of_a_known_token_is_what_is_stored()
    {
        // SHA-256 of "abc", from the FIPS 180 test vectors: pins the algorithm, not just that something is hashed.
        GraphToken.Hash("abc").Should().Be("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    [Fact]
    public void FR_GRAPH_01_the_right_token_verifies_and_a_wrong_one_does_not()
    {
        var token = GraphToken.Generate();
        var stored = GraphToken.Hash(token);

        GraphToken.Verify(token, stored).Should().BeTrue();
        GraphToken.Verify(GraphToken.Generate(), stored).Should().BeFalse();
        GraphToken.Verify(token + "x", stored).Should().BeFalse();
        GraphToken.Verify(token.ToUpperInvariant(), stored).Should().BeFalse();
    }

    [Theory]
    [InlineData(null, "abc")]
    [InlineData("", "abc")]
    [InlineData("abc", null)]
    [InlineData("abc", "")]
    public void FR_GRAPH_01_a_missing_token_or_hash_never_verifies(string? token, string? stored)
    {
        GraphToken.Verify(token, stored).Should().BeFalse();
    }

    [Fact]
    public void FR_GRAPH_01_a_graph_with_no_stored_hash_cannot_be_opened_with_the_hash_of_nothing()
    {
        // A graph owned by a signed-in user (v2) has no anonymous hash: no token may open it.
        GraphToken.Verify(GraphToken.Generate(), null).Should().BeFalse();
    }
}
