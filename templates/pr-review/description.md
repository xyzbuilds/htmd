# pr-review

List of changed files in a PR with per-file inline comment threads.
Each unresolved comment has a "Mark resolved" toggle; changes are
aggregated and copied back as a prompt via the FAB.

Schema: `{ pr: { title, author, base, head }, files: [{ path, additions, deletions, comments: [{ line, body, resolved }] }] }`.
