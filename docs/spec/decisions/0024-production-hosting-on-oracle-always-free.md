# 0024. Production runs on Oracle Cloud Always Free, for USD 0 a month, with the domain configurable

- **Status:** Accepted (the developer's decisions of 2026-10-14). The facts below were read from Oracle's pages on 2026-10-14 and are read again when the deployment pull request starts. Nothing is built.
- **Date:** 2026-10-14
- **Spec:** NFR-COST-01 (changed from "under USD 25 per month" to USD 0 hosting), NFR-REL-02, NFR-SEC-01, section 13 (Deployment, CI pipeline), section 15 (open questions and risks); decision 0023

## Context

The spec priced production at under USD 25 a month, which assumed a paid VPS, and listed "VPS or Azure Container Apps" and "which domain" as open questions. The developer asked for hosting at **USD 0**, with a domain as the only optional cost, to run the Docker Compose stack (Caddy, Api, Worker, PostgreSQL, Redis, the Aspire Dashboard and the static web files).

## Decision

1. **Compute: one Oracle Cloud Always Free Ampere A1 VM** (`VM.Standard.A1.Flex`), **2 OCPU and 12 GB of memory**, running Docker Compose. The host is **arm64**, so every image is built for `linux/arm64` (and `linux/amd64` stays for local use).
2. **Storage:** the boot volume and any block volume share the **200 GB of Always Free block storage**; the data volume of PostgreSQL lives on it.
3. **Terraform's remote state** and the **nightly `pg_dump` backups** (14 days kept) go in **Always Free Object Storage**, in separate buckets, with versioning on for the state bucket. State uses Terraform's native `oci` backend, which supports locking.
4. **Domain: start with a free subdomain**, and keep the name **configurable**: one variable (`NODEABLE_DOMAIN`) feeds Terraform, the Caddyfile (the site address and the Aspire Dashboard's hostname), the CSP, the About page's links and, in v2, the OAuth redirect addresses. Buying a domain later is then a value change and a DNS change. Which free subdomain service is chosen, and whether it can also give the dashboard its own hostname, is settled in the deployment pull request.
5. **Budget guard:** an OCI budget with an alert at USD 1, so that a mistake that leaves the free limits is noticed.

## What Oracle's page said (2026-10-14)

Read from [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm):

| Resource | Limit stated |
| --- | --- |
| Ampere A1 compute | 1,500 OCPU hours and 9,000 GB hours a month, "equivalent to 2 OCPUs and 12 GB of memory" for Always Free tenancies. A search result also showed an older figure of 4 OCPUs and 24 GB in third-party articles; the page itself says 2 and 12, which is what this decision assumes |
| Block Volume | 200 GB in total, for boot volumes and block volumes combined, and five volume backups; the minimum boot volume is 47 GB in one place on the page and 50 GB in another |
| Object Storage | 20 GB of Always Free storage (Standard, Infrequent Access and Archive combined) and **50,000 API requests a month** |
| Outbound data | 10 TB a month |
| Idle compute | An instance is idle if, over 7 days, the 95th-percentile CPU is below 20%, network is below 20% and (A1 shapes only) memory is below 20%; idle Always Free instances may be reclaimed |

## Idle reclamation, and the fallback

- **This will probably happen to a portfolio site.** The three conditions must all be true, and at portfolio traffic CPU and network will almost certainly be under 20%. Memory is the only one that might not be (20% of 12 GB is 2.4 GB), and it is measured in the deployment pull request instead of guessed.
- **Plan: upgrade the account to Pay As You Go and stay inside the free limits.** Oracle's page says it does not charge for Always Free resources after an upgrade and charges only for use above the limits, and that mixing paid and Always Free resources is not recommended. **Not confirmed on that page:** whether an upgraded account's idle instances are exempt from reclamation. A 2023 notice quoted by a third-party blog said so; that is history, not a term. It is read from Oracle's current terms before the upgrade is relied on.
- **The consequence of upgrading is a card on file.** The budget alert (item 5) is what makes that safe, and the Terraform configuration declares only resources that are inside the free limits.
- **Not planned:** a process that burns CPU to look busy. It would defeat the point of the rule, and the fallback is a legitimate answer.
- **If an instance is reclaimed,** it is restarted if the shape is available in the region. Restoring from a backup (the monthly drill of section 13) and re-running Terraform are the recovery, and the repeatable build is why Terraform is used at all.

## Consequences

- **Capacity.** Free A1 instances are often reported as unavailable ("out of host capacity") when created. The Terraform apply may need retrying over days; this is a risk in section 15, not something the code can fix. Choosing a home region is permanent for the tenancy, so it is the developer's decision at signup.
- **Arm64 images.** The CI image build produces `linux/arm64` (GitHub's Arm hosted runners or QEMU emulation, whichever the pull request finds workable; not checked yet). The .NET images, PostgreSQL and Redis publish arm64 variants; Node is only a build tool, so the web image is static files and is architecture independent.
- **A single host is a single point of failure.** NFR-REL-02's 99.5% a month is a target, not a promise, and the About page does not claim more. The external monitor (decision 0023) is what measures it.
- **Object Storage limits shape the backups.** 14 dumps must fit in 20 GB together with the state and its versions, so the dump is compressed and its size is a figure on `/status`; the 50,000 requests a month are far more than a nightly upload and a state read need.
- **Everything is configuration, not a promise from Oracle.** Free-tier limits have changed before (the compute figure above is one place where sources disagree), so the limits are re-read at the start of the deployment pull request and a change is a spec update.
- **No lock-in beyond Terraform.** The stack is Docker Compose; moving to any VPS means changing the Terraform provider block and the DNS record.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| A paid VPS (the original plan, under USD 25 a month) | The developer set the budget to USD 0 |
| Azure Container Apps | Stronger on a .NET CV, but PostgreSQL and Redis would be managed services with a cost (Azure's current free allowances were not checked), against a USD 0 budget |
| Run the Api on a free PaaS and the database on a free tier elsewhere | Several providers' free-tier terms to track, and free tiers commonly sleep services or cap database size, which the crawler would hit (assumed, not checked) |
| A home machine with a tunnel | Not a host a reviewer can rely on, and exposes a home network |
