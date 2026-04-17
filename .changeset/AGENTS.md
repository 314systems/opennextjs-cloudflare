# Changesets

Every non-trivial change to the project - those that should appear in the changelog - must be captured in a "changeset".
We use the [`changesets`](https://github.com/changesets/changesets/blob/main/README.md) tool for creating changesets, publishing versions and updating the changelog.

- Create a changeset for the current change.

  ```sh
  pnpm changeset
  ```

- Select which workspaces are affected by the change and whether the version requires a major, minor or patch release.
- Update the generated changeset with a description of the change.
- Include the generate changeset in the current commit.

  ```sh
  git add ./changeset/*.md
  ```

## Changeset message format

Each changeset is a file that describes the change being merged. This file is used to generate the changelog when the changes are released.

To help maintain consistency in the changelog, changesets should have the following format:

```text
<TYPE>: <TITLE>

<BODY>

[BREAKING CHANGES <BREAKING_CHANGE_NOTES>]
```

- `TYPE` should be a single word describing the "type" of the change. For example, one of `feature`, `fix`, `refactor`, `docs` or `chore`.
- `TITLE` should be a single sentence containing an imperative description of the change.
- `BODY` should be one or more paragraphs that go into more detail about the reason for the change and anything notable about the approach taken.
- `BREAKING_CHANGE_NOTES` (optional) should be one or more paragraphs describing how this change breaks current usage and how to migrate to the new usage.

## Changeset file example

The generated changeset file will contain the package name and type of change (eg. `patch`, `minor`, or `major`), followed by our changeset format described above.

Here's an example of a `patch` to the `@opennextjs/cloudflare` package, which provides a `fix`:

```md
---
"@opennextjs/cloudflare": patch
---

fix: replace the word "publish" with "deploy" everywhere.

We should be consistent with the word that describes how we get a worker to the edge. The command is `deploy`, so let's use that everywhere.
```

## Types of changes

We use the following guidelines to determine the kind of change for a PR:

- Bugfixes and experimental features are considered to be 'patch' changes. Be sure to log warnings when experimental features are used.
- New stable features and new deprecation warnings for future breaking changes are considered 'minor' changes. These changes shouldn't break existing code, but the deprecation warnings should suggest alternate solutions to not trigger the warning.
- Breaking changes are considered to be 'major' changes. These are usually when deprecations take effect, or functional breaking behavior is added with relevant logs (either as errors or warnings.)
