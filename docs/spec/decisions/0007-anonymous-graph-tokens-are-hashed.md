# 0007. Anonymous graph tokens are stored as a hash

- **Status:** Accepted (column in place in M1; hashing and verification arrive with the graph endpoints in M3)
- **Date:** 2026-10-11
- **Spec:** section 8 (`graphs.anon_token`), section 9 (`X-Graph-Token`), NFR-SEC-01, section 11 (never log anonymous graph tokens)

## Context

An anonymous graph is authorised by a secret `anonToken` that the browser keeps and sends in the `X-Graph-Token` header. That token is a bearer credential: anyone holding it can read and change the graph. Section 8 stores it in a column named `anon_token`, which means a database leak or an over-broad query would expose every anonymous graph's credential.

## Decision

- The column is `anon_token_hash` and holds the **SHA-256 hash** of the token. The plain token is returned to the client once, when the graph is created, and never stored.
- On each request the Api hashes the presented header value and compares it with the stored hash using a constant-time comparison.
- Tokens are long random values (at least 128 bits from a cryptographic random source), so a fast hash is sufficient: there is no password-guessing problem to slow down.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Store the token as is | A database leak exposes every credential. |
| A slow password hash (bcrypt, Argon2) | Protects low-entropy secrets; these are random 128-bit values, and a slow hash would only add latency to every request. |

## Consequences

- A lost token cannot be recovered: the user has to create a new graph (or sign in, in v2, when anonymous graphs migrate to an account).
- The `Graph` entity already exposes `AnonTokenHash`, never the token.
