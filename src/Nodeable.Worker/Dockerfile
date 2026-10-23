# syntax=docker/dockerfile:1
#
# The Worker image (spec section 13, decision 0029). Build from the repository root:
#   docker build -f src/Nodeable.Worker/Dockerfile -t nodeable-worker .
#
# Built the same way as the Api image: the SDK stage runs on the build machine and publishes for the target architecture.
# The Worker is a generic host with no web server, but it uses the ASP.NET Core shared framework through the Infrastructure
# and ServiceDefaults projects (SignalR's Redis backplane, health checks), so its runtime is the ASP.NET one too.

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

# .editorconfig carries the analyzer settings the build enforces (it marks the generated migrations, for one).
COPY .editorconfig global.json Directory.Build.props Directory.Packages.props ./
COPY src/Nodeable.Domain/Nodeable.Domain.csproj src/Nodeable.Domain/
COPY src/Nodeable.Infrastructure/Nodeable.Infrastructure.csproj src/Nodeable.Infrastructure/
COPY src/Nodeable.ServiceDefaults/Nodeable.ServiceDefaults.csproj src/Nodeable.ServiceDefaults/
COPY src/Nodeable.Worker/Nodeable.Worker.csproj src/Nodeable.Worker/

RUN case "$TARGETARCH" in amd64) echo linux-x64 > /rid ;; arm64) echo linux-arm64 > /rid ;; *) echo "Unsupported architecture $TARGETARCH" >&2; exit 1 ;; esac \
 && dotnet restore src/Nodeable.Worker/Nodeable.Worker.csproj -r "$(cat /rid)"

COPY src/Nodeable.Domain src/Nodeable.Domain
COPY src/Nodeable.Infrastructure src/Nodeable.Infrastructure
COPY src/Nodeable.ServiceDefaults src/Nodeable.ServiceDefaults
COPY src/Nodeable.Worker src/Nodeable.Worker

RUN dotnet publish src/Nodeable.Worker/Nodeable.Worker.csproj -c Release -r "$(cat /rid)" --no-self-contained --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app
COPY --from=build /app/publish .

USER $APP_UID
ENTRYPOINT ["dotnet", "Nodeable.Worker.dll"]
