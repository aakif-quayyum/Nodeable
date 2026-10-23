# Oracle deployment: your setup checklist (PR 10)

Do these steps yourself, in order, before PR 10 runs Terraform. **Never paste a password, key, token or the contents of a key file into the chat.** Where a step says "save as", it means a file on your own computer. When you are done, tell me "checklist done" and I will check that the files exist (I do not open the private ones) and then run Terraform.

Console menus change now and then. If a name below differs from what you see, trust the screen and look for the closest match.

## What you will end up with

| Thing | Where it lives | In GitHub? |
|-------|---------------|-----------|
| Oracle account, budget alert, compartment `nodeable` | Oracle console | no |
| SSH key pair | `C:\Users\User\.ssh\nodeable_oracle` (private) and `.pub` (public) | **no** |
| OCI API key + `config` file | `C:\Users\User\.oci\` | **no** |
| Terraform state bucket | Oracle Object Storage | no |
| IDs (tenancy, user, compartment, namespace) | `infra\terraform\terraform.tfvars` on your machine (git ignores it) | **no** |
| DuckDNS subdomains | duckdns.org | no |
| App passwords (database, `/status`, dashboard) | generated on the server by a script I write, saved in `/opt/nodeable/.env` there | **no** |

**GitHub Actions secrets needed: none.** Images are pushed with GitHub's built-in token, the server pulls public images, and you deploy from your own machine over SSH. (If we later deploy from Actions, one secret, `DEPLOY_SSH_KEY`, is added then. Not now.)

## 1. Oracle Cloud account

### 1.1 Before you start

- A **credit or debit card** (Visa or Mastercard) with online and international payments switched on in your bank's app. Oracle checks it with a small temporary hold of about USD 1, released in a few days. Some prepaid and local-only cards are refused.
- One account per person; do not make a second one if the first is rejected, use Oracle's support chat instead.
- Stay on the free path. **Do not upgrade to Pay As You Go** unless I tell you the capacity error cannot be waited out (see 1.3).

### 1.2 Choose the home region (permanent)

The home region **cannot be changed later**, and Always Free compute only runs there. For Sri Lanka the nearest Oracle regions are:

| Region | Identifier | Notes |
|--------|-----------|-------|
| India South (Hyderabad) | `ap-hyderabad-1` | **My first choice.** Close to Sri Lanka and a younger region, so likely less crowded than Mumbai. This is my judgement, not a measurement. |
| India West (Mumbai) | `ap-mumbai-1` | Lowest latency from India, but community reports say Ampere A1 capacity there is scarce. |
| Singapore | `ap-singapore-1` | Farther, older and bigger. A fair third choice. (`ap-singapore-2`, Singapore West, also exists.) |

What I could and could not check (2026-10-23): Oracle's documentation lists all these regions, each with **one** availability domain, so there is no second domain to try. **Oracle does not publish which regions currently have free Ampere A1 capacity**, and I found no reliable current data. So the choice is a bet; the only real test is creating the instance after sign-up.

The free allowance is **2 OCPUs and 12 GB of memory** (1,500 OCPU hours and 9,000 GB hours a month), 200 GB of block storage, and 10 TB of outbound data a month. Older articles say 4 OCPUs and 24 GB; Oracle's page now says 2 and 12, and the plan is built on that (decision 0024).

### 1.3 "Out of host capacity"

Oracle can answer a request for a free Ampere A1 VM with **"Out of host capacity"**. It means the region has no free A1 machines right now, not that your account is wrong. What to do:

1. Do nothing different: PR 10 includes a retry script that asks again every few minutes. It can take hours or days.
2. Do not delete and recreate the account or open a second one.
3. If it is still failing after about a week, tell me. The options then are a smaller VM (1 OCPU, 6 GB, which is easier to get) or upgrading to Pay As You Go, where Oracle says it does not charge for Always Free usage and only for use above the free limits. That is your decision, and the USD 1 budget alert (1.5) is what protects you.

### 1.4 Sign up

1. Open <https://www.oracle.com/cloud/free/> and click **Start for free**.
2. Pick **Sri Lanka** as the country. If it is not in the list, Oracle's page says to use the chat link and ask Sales to sign you up.
3. Enter your name and email, then verify the email with the code Oracle sends.
4. Choose a **Cloud Account Name** (this becomes your tenancy name; for example `nodeable-yourname`). Remember it.
5. **Home Region**: pick the one from 1.2. Double-check it, because it is permanent.
6. Fill in the address and mobile number, verify the number, then enter the card.
7. Wait for the email "Your Oracle Cloud account is ready" (minutes to a few hours).
8. Sign in at <https://cloud.oracle.com>: enter the account name, click Continue, then use **Oracle Cloud Infrastructure Direct Sign-In** with your email and password.

### 1.5 Turn on two-step sign-in (MFA)

Top-right profile icon, **My profile**, **Security**, **Enable MFA** (or "Multi-factor authentication"), and follow the steps with an authenticator app.

### 1.6 Budget alert at USD 1

1. Top-left menu (three lines), **Billing & Cost Management**, **Budgets**, **Create budget**.
2. Name `nodeable-1-usd`. Scope: **Compartment**, choose the root one (it has your tenancy name). Budget amount: **1**. Reset day: **1**.
3. Next, add alert rules (each with your email in "Email recipients"):
   - **Actual spend**, threshold type **Percentage**, **50**.
   - **Actual spend**, **Percentage**, **100**.
   - **Forecast spend**, **Percentage**, **100**.
4. **Create**.

A budget only **emails** you; it does not stop spending. The real protection is that the Terraform stays inside the free shapes. Look at **Billing & Cost Management, Cost analysis** after the first week.

### 1.7 Create the compartment

Menu, **Identity & Security**, **Compartments**, **Create compartment**. Name `nodeable`, description "Nodeable production", parent: the root. Open it afterwards and click **Copy** next to its **OCID** (you will need it in step 2.6).

### 1.8 Things to know

- Oracle can **reclaim an idle Always Free VM**: if over 7 days the 95th-percentile CPU, the network and (for A1) the memory use are all below 20 percent. Postgres, the Api and the Worker should stay above that; the status page will show it, and I will note it in the runbook.
- The trial credit ends after its trial period (the console shows the date) and the account becomes Always Free only: then 20 GB of object storage in total. Our state file and backups are far smaller; keep it that way.

## 2. Credentials, one by one

### 2.1 Install the tools

In PowerShell:

```powershell
winget install --id Hashicorp.Terraform -e
```

Open a new PowerShell window and run `terraform version` (it should print a version). You do not need the OCI command-line tool on your machine.

### 2.2 SSH key (log in to the server)

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\nodeable_oracle" -C "nodeable-oracle"
```

Choose a passphrase when asked and keep it in your password manager. This makes two files: `nodeable_oracle` (private, never leaves your computer) and `nodeable_oracle.pub` (public; its text goes into the Terraform variables in 2.6; it is not a secret).

### 2.3 OCI API key (lets Terraform act as you)

1. Console, top-right profile icon, **My profile**.
2. Under **Resources** (left), **API keys**, then **Add API key**.
3. Choose **Generate API key pair**, click **Download private key** and save it as `C:\Users\User\.oci\nodeable_api_key.pem` (create the `.oci` folder first). Click **Add**.
4. A "Configuration file preview" opens. Copy its text into a new file `C:\Users\User\.oci\config` **on your computer**, and change the `key_file=` line to `C:\Users\User\.oci\nodeable_api_key.pem`. The file holds your user OCID, fingerprint, tenancy OCID and region.
5. Restrict the key file to yourself:

   ```powershell
   icacls "$env:USERPROFILE\.oci\nodeable_api_key.pem" /inheritance:r /grant:r "${env:USERNAME}:(R)"
   ```

This is a local-only secret. It is not a GitHub secret. Terraform uses the same profile for its state, so no extra keys are needed.

### 2.4 Terraform state bucket

Terraform has to store its state somewhere that exists before it starts, so this one bucket is made by hand.

1. Menu, **Storage**, **Buckets**. Compartment: `nodeable`. **Create bucket**.
2. Name `nodeable-tfstate`, tier **Standard**, leave encryption on the default, and tick **Enable Versioning**. Keep it private.
3. On the Buckets page note the **Namespace** (a short string shown at the top).

The backups bucket and the permissions the VM needs to write to it are created by Terraform. The server uses an **instance principal** (Oracle identifies the VM itself), so there are **no object storage keys** to make or keep.

### 2.5 DuckDNS (see section 3)

Do section 3 now if you like; it only needs your login.

### 2.6 The values file

Copy `infra\terraform\terraform.tfvars.example` to `terraform.tfvars` in the same folder. (I add the example file in PR 10; until then this step waits.) Fill in, by editing the file yourself:

| Variable | Where to find it |
|----------|------------------|
| `tenancy_ocid` | Profile icon, **Tenancy: ...**, copy the OCID |
| `compartment_ocid` | the compartment from 1.7 |
| `region` | the identifier from 1.2 |
| `ssh_public_key` | the one line inside `nodeable_oracle.pub` |
| `namespace` | from 2.4 |
| `domain` | from section 3, for example `nodeable.duckdns.org` |

OCIDs are identifiers, not secrets, but the repository will be public, so they stay in this file, which git ignores (`*.tfvars`). Check with `git status` that it does not appear.

### 2.7 Passwords for the app

You do not make them now. A script (PR 10) runs on the server, generates the database and dashboard passwords at random, asks you at the keyboard on the server for the `/status` operator password, and writes `/opt/nodeable/.env` readable by its owner only. Nothing goes through chat or GitHub.

### 2.8 Later, not now

- **GitHub package visibility:** after the first image is pushed, set each package to **Public** (profile, **Packages**, the package, **Package settings**, **Change visibility**) so the server can pull without a token. This goes with making the repository public (decision D6, yours to flip).
- **Better Stack** (free uptime monitor): after the site is live, create a monitor for `https://<your domain>/api/v1/status/health`. No token goes in the repository.

## 3. Subdomain with DuckDNS

You need **two** names, because the telemetry dashboard gets a hostname of its own (spec section 11).

1. Open <https://www.duckdns.org> and sign in with GitHub or Google.
2. In **domains**, type `nodeable` and click **add domain**. Add a second one, for example `nodeable-dash`. (Pick other names if these are taken; the free limit is five.)
3. Leave the **current ip** empty for now. After Terraform creates the server it prints a fixed (reserved) public IP; I will tell you the number. Then type it into the **current ip** box of **both** domains and click **update ip**. A reserved IP does not change, so you do this **once**.
4. The **token** at the top of the page is a secret. You do not need it for this, so do not copy it anywhere. (It would only be needed to update the IP automatically; if we ever do that it becomes the GitHub secret `DUCKDNS_TOKEN`, not now.)

**Certificate.** Caddy asks Let's Encrypt for a certificate by itself, using the HTTP challenge: it needs port 80 reachable and the name pointing at the server's IP, which is why step 3 comes before the first start. I checked today that `duckdns.org` is on the Public Suffix List, so Let's Encrypt counts each subdomain separately and our requests do not compete with other DuckDNS users' rate limits.

**Changing the domain later.** The name is one variable, `domain` (`NODEABLE_DOMAIN` on the server), read by Terraform, the Caddyfile, the content security policy and the app's links. To move to a bought domain: add an `A` record at your registrar pointing to the reserved IP, change the variable, restart Caddy; it fetches the new certificate itself.

## 4. Seed albums (D7)

The proposal with measured credit counts is in `docs/dev/seed-albums.md`. Tell me which to keep.

## What I will do after "checklist done"

1. Check that the files exist: `~\.oci\config`, the API key, the SSH key pair, `terraform.tfvars`, and `terraform version` works. I do not read the private files.
2. Run `terraform init` and `terraform plan` and show you the plan before anything is created. It will contain one VM (`VM.Standard.A1.Flex`, 2 OCPUs, 12 GB, within the free limit), a boot volume (100 GB of the 200 GB free), the network, a reserved public IP, the backups bucket, and the instance-principal permissions.
3. On your go-ahead, `terraform apply` with the capacity retry.
