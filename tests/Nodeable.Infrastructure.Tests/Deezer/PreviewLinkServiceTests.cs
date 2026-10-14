using Nodeable.Infrastructure.Deezer;

namespace Nodeable.Infrastructure.Tests.Deezer;

public sealed class PreviewLinkServiceTests
{
    [Fact]
    public void FR_PREVIEW_01_the_expiry_is_read_from_the_signed_url()
    {
        var url = "https://cdnt-preview.dzcdn.net/api/1/1/d/8/c/0/x.mp3?hdnea=exp=1791967804~acl=/api/1/1/d/8/c/0/x.mp3*~data=user_id=0~hmac=00";

        PreviewLinkService.ExpiryOf(url).Should().Be(DateTimeOffset.FromUnixTimeSeconds(1791967804));
    }

    [Theory]
    [InlineData("https://cdnt-preview.dzcdn.net/x.mp3")]
    [InlineData("https://cdnt-preview.dzcdn.net/x.mp3?hdnea=exp=soon~hmac=00")]
    [InlineData("")]
    public void FR_PREVIEW_01_an_address_with_no_readable_expiry_says_so_instead_of_guessing(string url)
    {
        PreviewLinkService.ExpiryOf(url).Should().BeNull();
    }
}
