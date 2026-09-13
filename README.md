# satz-tree-sitter

A [tree-sitter](https://tree-sitter.github.io) grammar for **Satz**, the language
[satz](https://github.com/tjirsch/satz) compiles to OpenTofu. The parser name is
`satz`; the exported symbol is `tree_sitter_satz`.

The grammar mirrors satz's own front-end (`crates/satz-core/src/satz.rs`): the same
ten token kinds, the same contextual keywords, the same string rules (`\n \" \\`
escapes in a single-line string, none in a `"""` string, `{{` for a literal brace,
`{name}` for a parameter). The `hcl { … }` passthrough is kept brace-balanced the
way satz keeps it — strings and comments are stepped over; a heredoc with unbalanced
braces inside an `hcl` body is not handled.

## Use

The Zed extension that consumes this grammar lives in the satz repository under
`editors/zed/` and pins a commit of this one. Any other tree-sitter consumer needs
only `src/`, which is generated and committed.

## Develop

```sh
brew install tree-sitter-cli            # 0.27
tree-sitter generate                    # grammar.js -> src/
tree-sitter test                        # test/corpus/*.txt
scripts/parse-corpus.sh ~/projects/satz # every .satz file of a satz checkout, zero errors
```

A language change in satz is a grammar change here first, then a satz PR that bumps
the pinned commit in `editors/zed/extension.toml`. CI runs the three commands above
against a fresh clone of satz, on every push and weekly.

Test inputs use example values only (the satz privacy rule applies here without a
gate to enforce it).
