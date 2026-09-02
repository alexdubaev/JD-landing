# Test Runtime: Version and Data Identity

## The only accepted identifiers

| Purpose | Identifier | Rule |
| --- | --- | --- |
| Production | `origin/main` and the production server's exact SHA | A production result is never a local browser tab. |
| Review branch | `origin/<named-branch>` and its exact SHA | The local worktree HEAD must equal the remote branch head. |
| Local test process | absolute worktree path + branch + SHA + branch-local env file + Directus URL + URL | All six are printed before Next starts. |
| `@Sites` publication | exact project ID in `.openai/hosting.json` | Every Sites deployment URL is public. Its source SHA must equal the selected remote review branch SHA. |

## Start a local review safely

1. Use the branch whose remote SHA is the approved review candidate. Push the reviewed
   commit first; unpushed commits are intentionally refused.
2. Place an owner-provisioned, non-committed `frontend/.env.local` in that same
   worktree. Do not copy, symlink, inject or inherit an env file from another worktree.
   The launcher clears inherited `DIRECTUS_*` values before it starts Next.
3. The launcher reads only `DIRECTUS_URL` from the branch-local env file, validates that
   it contains no credentials or query data, and prints the resulting URL. It never logs
   the token. The URL must be present in the `config/review-runtime-targets.json` version
   at `origin/main`; an empty allowlist fails closed. A test branch cannot approve its
   own source. Add or change an allowed origin only in a separately approved main/config
   release after confirming which Directus instance is safe for review.
4. Run the repository command with an explicit branch and a non-default local port:

   ```powershell
   node scripts/start-test-runtime.mjs `
     --workspace D:\path\to\JD_landing-test-worktree `
     --branch codex/review-branch `
     --env-file D:\path\to\JD_landing-test-worktree\frontend\.env.local `
     --port 3101
   ```

The command builds once, rechecks the exact identity, then binds `next start` to
`127.0.0.1`, not a public interface. It never uses HMR, so later source edits cannot
change the reviewed process under the same receipt. A refusal is a successful safety
check; fix the identity mismatch, then retry.

After launch, recover the identity without relying on terminal history:

```powershell
node scripts/show-test-runtime.mjs --port 3101
```

It reports the saved receipt and whether the registered process is still running. A
stopped receipt never proves that a later process on the same port is the same build.

## Explicitly prohibited shortcuts

- Do not run `next dev` directly from an arbitrary checkout; `npm run dev` enters the guard.
- Do not reuse a root-worktree `.env.local` for a test branch.
- Do not call any local Directus process “the test CMS” merely because it responds.
- Do not publish a raw port on the production VPS as a test site.
- Do not merge into `main`, push `main`, or deploy production to make a test result
  visible.

## Publish to `@Sites`

`@Sites` is linked to the exact opaque project ID in `.openai/hosting.json`. It was
previously unrecorded, which allowed its independent source history to be mistaken for
this Git repository. Do not create a second Sites project.

Before saving a Sites version, push the selected review commit, prove that local `HEAD`
equals `origin/<branch>`, and use that same full SHA as the version source. Check the
saved version before deployment. A Sites deployment changes a public URL; do it only
after the owner explicitly asks to publish that exact version. It must never be
substituted by a raw VPS port.

## Before a merge or production release

Record the tested remote branch SHA, the resulting commit selected for `main`, the
reviewer’s confirmation, and the production server SHA after release. These four
values must be identical where applicable; a title such as “latest site” is not
evidence.
