# Infrastructure as code

This directory is a placeholder, deliberately left mostly empty, rather than
populated with Terraform for a specific cloud provider — and that's worth
explaining rather than leaving as a silent gap (section 52 of the brief:
"if external cloud credentials are unavailable, create the infrastructure
code but clearly document the external steps required").

## Why no provider-specific Terraform ships here

This app has exactly two infrastructure dependencies: **a place to run a
Node process, and a PostgreSQL 16 database.** Nothing here uses a
provider-specific managed service (no cloud-specific queue, no
provider-specific auth service, no proprietary storage API) — see
[ARCHITECTURE.md](../../ARCHITECTURE.md#deployment) and
[DEPLOYMENT.md](../../DEPLOYMENT.md). Writing Terraform for, say, AWS
(ECS + RDS) would embed a provider choice this business hasn't necessarily
made, and — more importantly — it could not have been tested in the
environment this project was built in, which had no cloud credentials and
no Terraform provider plugins reachable over the network. Shipping untested
Terraform that looks authoritative seemed worse than shipping none with a
clear explanation, per the brief's own instruction not to "pretend external
infrastructure was provisioned if it wasn't" (section 12).

## What to actually provision

Whichever provider you choose, you need:

1. **Compute** to run the Docker image (or `node .next/standalone/server.js`
   directly) — a single small container/instance is enough at this
   business's scale. ECS Fargate, Cloud Run, a basic VM, or a PaaS like
   Railway/Render/Fly.io are all reasonable; nothing in the app assumes one
   over another.
2. **PostgreSQL 16**, reachable from that compute, with automated backups —
   a managed instance (RDS, Cloud SQL, Supabase, Neon) is the pragmatic
   choice; see [DEPLOYMENT.md#backups](../../DEPLOYMENT.md#backups).
3. **TLS termination** in front of the app (a load balancer, or the PaaS's
   built-in HTTPS) — see [DEPLOYMENT.md#https](../../DEPLOYMENT.md#https).
4. Environment variables set on the compute layer per
   [README.md#environment-variables](../../README.md#environment-variables) —
   never baked into the image.

If your team standardises on a specific provider, this directory is the
right place to add real Terraform for it; the module boundary is intentionally
provider-agnostic up to this point so that addition stays contained rather
than requiring changes to the application itself.
