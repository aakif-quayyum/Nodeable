# 0029. Container images are built natively for both architectures, run on distroless images, and are scanned in CI

- **Status:** Accepted 2026-10-21. The developer approved the plan, with three defaults: no registry push in this pull request, distroless runtime images, and a committed OpenAPI file with an explicit version.
- **Date:** 2026-10-21
- **Spec:** section 13 (CI pipeline step 3, step 4 and the deployment), NFR-SEC-01, NFR-SEC-04, NFR-COST-01; decisions 0023 (no Collector) and 0024 (an arm64 host on Oracle Always Free)

## Context

Production is one Oracle Ampere A1 VM, which is **arm64**, running Docker Compose (decision 0024). GitHub's runners are amd64. The spec asks CI to build images for Api, Worker and Web for both architectures, scan them for vulnerabilities, and diff the Api's OpenAPI document against `main`. No Dockerfile existed. Three things were not obvious:

- Building arm64 on an amd64 runner with emulation (QEMU) makes `dotnet restore` and `npm ci` very slow.
- A scan that fails on every finding is switched off within a week; one that ignores everything protects nothing.
- "Breaking changes fail unless the version changes" needs a version that is a deliberate number and a "before" to compare with.

## Decision

1. **One Dockerfile per image**, beside what it builds: `src/Nodeable.Api/Dockerfile`, `src/Nodeable.Worker/Dockerfile`, `web/Dockerfile`. The .NET ones are built from the repository root, because the central package files are there.
2. **The SDK stage runs on the build machine and cross-compiles** (`--platform=$BUILDPLATFORM`, then `dotnet publish -r linux-<arch>`, framework-dependent). An arm64 image is compiled natively on the amd64 runner; only the final stage, which copies files, is for the target. The web image builds the site the same way and only its last stage is per architecture.
3. **Distroless runtime for the .NET images:** `mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled`. It has no shell and no package manager, and runs as a non-root user. The **Worker uses the ASP.NET Core image too**, not the plain runtime, because it uses the ASP.NET Core shared framework through the Infrastructure and ServiceDefaults projects (SignalR's Redis backplane, health checks). Consequence: there is no `curl` for a container health check, so the deployment's health is checked from outside (Caddy's upstream check, and the uptime monitor on `/api/v1/status/health`).
4. **The Web image is `caddy:2-alpine` plus the built files at `/srv`**, with no site configuration: the Caddyfile (hostnames, TLS, the `/api`, `/hubs` and `/otlp` routes) belongs to the deployment. Caddy's image runs as root so the deployment's Caddy can bind ports 80 and 443; the check for a non-root user therefore covers the two .NET images only.
5. **CI builds both architectures and checks each** before scanning: the .NET host's `--info` reports the architecture (it runs under QEMU for arm64), the web image holds `/srv/index.html`, and the .NET images do not run as root.
6. **The scan is Trivy, from its official image at a fixed version, over each image of each architecture.** It fails on `HIGH` and `CRITICAL` findings that have a fix (`--ignore-unfixed`): those can be acted on by updating the base image, and Dependabot's weekly Docker updates are how. A finding that cannot be fixed is written in `.trivyignore` with a reason and an expiry date; an expired entry stops applying and the build fails again. No tool is added as a third-party action: the CLI runs from its image, as gitleaks does.
7. **The OpenAPI contract is committed** as `docs/api/openapi.json`, written by `gen:api` from the document every Api build produces and normalised (two-space JSON, LF, a final newline), so its bytes do not depend on the machine. CI regenerates it and fails on any difference, as it does for `schema.d.ts`.
8. **`info.version` is a constant (`ApiContract.Version`, now `1.0.0`)**, not the assembly version. On a pull request CI compares the committed file with the base branch's using oasdiff (from its official image, fixed version): a **breaking** change fails the build unless `info.version` differs from the base's. A major bump is how a breaking change is shipped on purpose. The first pull request that adds the file passes, because the base has none.
9. **Images are not pushed** in this pull request. A registry login and a host to pull from exist only once the deployment does; pushing to GitHub Container Registry and deploying are part of the deployment pull request.
10. **The workflow files are linted** with actionlint (official image, fixed version) in CI.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Build arm64 with QEMU end to end | `dotnet restore`, `dotnet publish` and `npm ci` under emulation take many times as long, and the runs would approach the job's time limit; cross-compiling changes only where the compiler runs |
| A self-hosted arm64 runner or a hosted arm64 runner | Another machine to run, or a paid or newer runner type; not needed once the build is cross-compiled |
| `aspnet:10.0` (Debian) or Alpine runtime images | Larger, with a shell and a package manager to patch and an attacker to use; Alpine's musl needs its own runtime identifier and has bitten .NET libraries before |
| Plain `runtime:10.0-noble-chiseled` for the Worker | It lacks the ASP.NET Core shared framework the Worker's dependencies reference; the Worker would fail at start |
| Failing the scan on every finding, or on none | See Context: the first is turned off, the second is theater |
| `trivy-action` or other scan actions | A third-party action to trust and keep current; the CLI from its own image does the same with the tag pinned in the workflow |
| Diffing against a second build of `main` | Doubles the build time and has nothing to read in review; a committed file is the "before" and shows the API change in the pull request |
| `info.version` from the assembly version | It changes on every release for reasons that have nothing to do with the contract, so it could not mean "a breaking change was intended" |

## Consequences

- An image takes a few minutes of CI per architecture (restore and publish run natively, QEMU only starts the `dotnet --info` and file checks). Layer caches are kept on disk between runs.
- A new high or critical vulnerability in a base image, with a fix, fails the next pull request that builds the image, not only the Dependabot one. That is intended: the way to clear it is a base image update, and it is rare enough to be a nuisance only when it matters.
- The contract file makes API changes visible in review, and `schema.d.ts` and `docs/api/openapi.json` change together.
- `.trivyignore` starts empty. Using it is a decision to record, not a way to get a pull request green.
- **An exception was accepted on 2026-10-21, for the Web image only:** Caddy 2.11.7, the newest `caddy:2-alpine`, is built with Go 1.26.8 and `golang.org/x/net` 0.59.0, and the scan found three high denial-of-service findings in them (CVE-2026-78667, CVE-2026-78669, CVE-2026-97031), fixed in Go 1.26.9 and x/net 0.60.0, for which no Caddy image exists yet. They are in `.trivyignore` with an expiry of 2026-11-10; any other high or critical finding still fails the build. The Api and Worker images were clean on both architectures. The deployment pull request must re-check for a fixed Caddy image first and, if there is none, build Caddy with the patched Go and x/net (`xcaddy`) instead of deploying this one.
- The deployment pull request still owes: the registry push, Compose, the Caddyfile, Terraform, and how the one-off EF Core migration runs before the Api starts (a migration bundle or a small runner image).
