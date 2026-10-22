# Local builds and CI

GitHub releases and Release Please/Publish workflows have been removed. Build/install from source with `node scripts/install.mjs`; see [installation](INSTALLATION.md). Package versions describe source versions, not available release downloads. Historical tags and commits remain.

CI continues validating types, lint, formatting, tests/coverage, schemas, production builds, Docker and the extracted local installation kit. Security checks dependencies, secrets, CodeQL and container/configuration risks. CI artifacts are validation evidence, not automatic publications.
