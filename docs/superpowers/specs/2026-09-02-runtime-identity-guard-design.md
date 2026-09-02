# Runtime Identity Guard Design

## Problem

The same label, "the local/test site", identified three different states:

- production `origin/main` at `8d28417`;
- the pushed UI test branch at `6a2d506`;
- a local-only UI commit at `57c680b`.

The locally started Next process used the test worktree while receiving configuration
from outside that worktree. Three Directus instances were also listening locally. The
existing `@Sites` project had no repository binding and its saved source SHA was absent
from this Git history. A raw VPS port was therefore not a valid substitute for an
approved test target.

## Decision

The standard test launch is a checked Node command. It receives an explicit worktree,
branch, port and environment file. Before it starts Next it must reject:

1. `main` or a branch different from the declared branch;
2. a dirty worktree;
3. a HEAD which is not exactly the current head of `origin/<branch>`;
4. an environment file outside the selected worktree;
5. a missing environment file;
6. a port already occupied; and
7. a `DIRECTUS_URL` with credentials, query data or a fragment.
8. a Directus origin not explicitly allowed for review in the repository.

The permitted review origins are read from `origin/main`, never from the test branch.
After the initial check the command builds once, repeats the identity check, and starts
that build rather than an HMR development process.

On success it prints one immutable, non-secret receipt: workspace, branch, full SHA,
environment file path, parsed Directus URL and URL. The command intentionally has no
`@Sites` publishing implementation: the existing Sites project is bound in
repository-owned configuration, but public deployment remains a separate explicit action
rather than a substitute for local review.

## Non-goals

- No Directus data, schema, role, token or environment value is changed. The guard reads
  only the non-secret `DIRECTUS_URL` needed to identify the CMS endpoint.
- No Docker, Caddy, VPS, `deploy/` or production process is changed.
- No frontend route or component is changed.
- This does not create a second `@Sites` environment or publish a version.

## Acceptance checks

- Unit tests prove each unsafe identity/configuration case is rejected.
- A dry run against the current local-only test commit rejects it because the SHA is
  not yet on the declared remote branch.
- Documentation names production and test identities separately and bans arbitrary
  raw-port publishing.
