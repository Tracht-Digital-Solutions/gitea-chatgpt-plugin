# Releases and CI/CD

Use Conventional Commits: `fix:` patch, `feat:` minor, `!` or `BREAKING CHANGE:` major. Tags use `vMAJOR.MINOR.PATCH`. Release Please updates the root package, portable manifest, MCP server version and changelog together.

CI runs type checking, ESLint, Prettier, coverage-gated tests, Gitea OpenAPI contracts, isolated real Gitea E2E, manifest/package validation, production build, Docker build and a non-root/read-only health check. Security runs dependency auditing, the free pinned Gitleaks CLI over full Git history, CodeQL and Trivy image/config scans. CodeQL results are processed before the workflow rejects open high/critical findings for the scanned ref. External Actions are commit-pinned; untrusted PRs receive no production secrets/write privileges.

The Release workflow calls both reusable quality/security gates. Release Please maintains release PRs and creates tags/releases when those PRs merge. Because GITHUB_TOKEN-created PRs do not automatically trigger ordinary workflows, the workflow explicitly dispatches CI/Security on the generated release branch. Repository settings must permit Actions to create PRs.

After a release is created, Publish is explicitly invoked with `workflow_call`, avoiding reliance on token-generated tag/release events. It checks/tests the release tag again, generates the plugin ZIP and server archive, computes checksums, publishes a versioned GHCR image with SBOM/provenance and attaches release assets. It downloads the assets and verifies checksums. The immutable image digest is included in `container-digest.txt`. Manual Publish retry is available for an existing release.

For the initial prerelease only, dispatch `release-please.yml` with `bootstrap=true` after the normal gates pass. It creates v0.1.0 as a prerelease. Do not reuse bootstrap or move an existing tag. Subsequently merge reviewed Release Please PRs through normal branch protection.

Protect main with required `quality`, `dependencies-and-secrets`, `codeql` and `container` checks, no force pushes/deletions and a linear PR history. The initial solo-maintainer configuration requires no independent approval but still enforces checks for administrators. Enable private vulnerability reporting. Verify public GHCR visibility with an anonymous pull after the first publish. Actual remote results are recorded in [PROGRESS](../PROGRESS.md); green CI does not imply ChatGPT account-level verification.
