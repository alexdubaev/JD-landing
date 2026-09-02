# Isolated UI/UX review publication

This procedure packages only the current review branch for the separate Sites
project in `.openai/hosting.json`. It does not change `main`, the existing
DEERE-SHOP Sites project, Directus data, Docker, Caddy, or VPS runtime.

## Build and package

From `frontend`, run:

```powershell
npm run sites:build
npm run sites:package
```

The second command creates `outputs/jd-landing-uiux-review.tgz`. Its root
contains the OpenNext Worker entrypoint, generated static assets, the exact
Sites project identity, and a source-commit manifest. Source files are never
uploaded as the deployment artifact.

## Publication gate

Before saving a Sites version, first push the exact reviewed commit to the
separate Sites source repository. Git LFS uploads may be skipped only after
this archive has been built and inspected: the Worker archive includes the
real generated assets, including tracked public images, so it does not rely on
the source repository's LFS API.

Saving a version is not a deployment. Configure the dedicated review site's
Directus runtime variables through Sites before any deployment that is expected
to be a full CMS-backed review.
