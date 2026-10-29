# WattStatus repository guidance

- Screenshots, before/after comparisons, test videos, browser traces, benchmark JSON, and temporary test reports are local evidence. Save them under `artifacts/` or `tmp/`; never stage or force-add them to Git.
- Keep application assets used by the site in `public/`, `src/assets/`, or their existing source directories. Do not ignore image extensions globally.
- Keep Markdown audit reports and documentation tracked. References to local captures may be useful in the author's workspace, but the captures are not part of the repository.
