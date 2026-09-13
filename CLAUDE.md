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
- **Example values only.** This repository has no privacy gate; nothing shaped like
  a customer id, domain, project or name goes into `test/corpus/`. Use the values
  of satz's `docs/examples.md`.
- **No external scanner until a real file needs one.** `hcl_body` is a nested rule;
  heredocs with unbalanced braces are the known gap.
- **Planning lives in the vault**, not here: `satz-private/ROADMAP.satz-tree-sitter.md`.
