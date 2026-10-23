namespace Nodeable.Api;

/// <summary>
/// The version of the Api's contract, written into the OpenAPI document as <c>info.version</c> (spec section 13). It is a
/// number someone changes on purpose: CI compares the committed document with the one on the base branch, and a breaking
/// change to it passes only when this version changed too. A major bump is the way to ship one deliberately.
/// </summary>
public static class ApiContract
{
    public const string Version = "1.0.0";
}
