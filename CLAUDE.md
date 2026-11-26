# satz-tree-sitter — working rules

Tree-sitter grammar for Satz. Parser name `satz` (no dashes; the CLI forbids them),
folder and repository `satz-tree-sitter`.

- **The grammar mirrors the parser, not the docs.** `crates/satz-core/src/satz.rs` in
  the satz repository is the reference: the lexer (`fn lex`), the string rules
  (`'"'` arm), `scan_hcl_body`, and `fn parse` for which keywords are valid where.
  Where the grammar and that file disagree, the grammar is the bug.
- **`src/` is generated and committed.** Zed compiles `src/parser.c` itself and
  never runs `tree-sitter generate`; after every `grammar.js` change run
  `tree-sitter generate` and commit `src/` with it. CI fails when they differ.
- **Zero corpus errors is the gate.** `scripts/parse-corpus.sh <satz-checkout>` must
  report no `ERROR`/`MISSING` over every `*.satz` under `presets/` and `tests/`
  (`*.diff.satz` files are diffs and are skipped). A new Satz statement lands here
  before the satz PR that pins the new commit.
- **Commits carry a GitHub noreply address.** The repository is public, history
  included. `scripts/check-authors.sh` refuses an author or committer that is not
  `<id>+<login>@users.noreply.github.com` (GitHub's own `noreply@github.com`
  committer of a squash merge passes); `$NAMES_IDENT` in the environment allows one
  more address in a clone, and no personal address is written into the script. The
  hook runs it on the commit being made — enabled once per clone with
  `git config core.hooksPath .githooks` — and CI runs it on the commits a pull
  request or push adds (the `authors` job in `.github/workflows/ci.yml`). Never
  `--no-verify`.
- **Example values only.** This repository has no privacy gate; nothing shaped like
  a customer id, domain, project or name goes into `test/corpus/`. Use the values
  of satz's `docs/examples.md`.
- **No external scanner until a real file needs one.** `hcl_body` is a nested rule and
  `hcl_heredoc` a regex token that ends at the first line that is one bare word, not at
  the line that repeats the tag — the known gap, closed exactly only by a scanner.
- **A line break is whitespace here.** The parser reads `all TYPE`, `under …` and
  `private TYPE.LABEL` only on one line; the grammar reads them across a break too.
- **Planning lives in the vault**, not here: `satz-private/ROADMAP.satz-tree-sitter.md`.
