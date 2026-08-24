# Release B implementation plan

1. Add failing tests for disabled defaults, bounded published input, deterministic
   queue upsert, atomic leases, escaping, timeout, non-overlapping ticks, role
   denies, migration repeatability, and disabled compose startup.
2. Implement pure worker planning plus Directus adapter with allowlisted reads,
   idempotent upsert, atomic claim/lease, draft-only article creation, and
   failure retry.
3. Add worker role/policy, additive schema fields, migration journal, extension
   boundary, disabled compose service, and secret-safe examples/runbook.
4. Run all Release B gates, review scope, commit, push, and deploy with the
   worker disabled. Do not enable shadow execution without a separate approval.
