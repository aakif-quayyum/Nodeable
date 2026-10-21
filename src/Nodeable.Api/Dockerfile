# syntax=docker/dockerfile:1
#
# The Api image (spec section 13, decision 0029). Build from the repository root:
#   docker build -f src/Nodeable.Api/Dockerfile -t nodeable-api .
#
# The SDK stage always runs on the machine doing the build (BUILDPLATFORM) and publishes for the image's platform
# (TARGETARCH), so an arm64 image is compiled natively on an amd64 runner instead of under emulation. Only the final
# stage, which copies files, is for the target.

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

# The project files and the central build settings go in first, so the restore layer is reused until a dependency changes.
# .editorconfig carries the analyzer settings the build enforces (it marks the generated migrations, for one).
COPY .editorconfig global.json Directory.Build.props Directory.Packages.props ./
COPY src/Nodeable.Domain/Nodeable.Domain.csproj src/Nodeable.Domain/
COPY src/Nodeable.Infrastructure/Nodeable.Infrastructure.csproj src/Nodeable.Infrastructure/
COPY src/Nodeable.ServiceDefaults/Nodeable.ServiceDefaults.csproj src/Nodeable.ServiceDefaults/
COPY src/Nodeable.Api/Nodeable.Api.csproj src/Nodeable.Api/

# Docker names architectures amd64 and arm64; the .NET runtime identifiers are linux-x64 and linux-arm64.
RUN case "$TARGETARCH" in amd64) echo linux-x64 > /rid ;; arm64) echo linux-arm64 > /rid ;; *) echo "Unsupported architecture $TARGETARCH" >&2; exit 1 ;; esac \
 && dotnet restore src/Nodeable.Api/Nodeable.Api.csproj -r "$(cat /rid)"

COPY src/Nodeable.Domain src/Nodeable.Domain
COPY src/Nodeable.Infrastructure src/Nodeable.Infrastructure
COPY src/Nodeable.ServiceDefaults src/Nodeable.ServiceDefaults
COPY src/Nodeable.Api src/Nodeable.Api

# The OpenAPI document is written at build time for the web app's types; the image does not need it, and generating it
# would start the app during the build.
RUN dotnet publish src/Nodeable.Api/Nodeable.Api.csproj -c Release -r "$(cat /rid)" --no-self-contained --no-restore \
    -p:OpenApiGenerateDocuments=false -o /app/publish

# Why chiseled: a chiseled image is the runtime and nothing else: no shell, no package manager, no curl, and a non-root user by default, so there is little to patch, little to scan and little for an attacker to use if the app is ever broken into
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app
COPY --from=build /app/publish .

# ASP.NET Core in a container listens on 8080 (plain HTTP); Caddy terminates TLS in front of it.
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Nodeable.Api.dll"]
