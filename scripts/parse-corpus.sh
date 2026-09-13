#!/usr/bin/env bash
# Parse every Satz file of a satz checkout with this grammar and fail on any
# ERROR or MISSING node. `*.diff.satz` files are unified diffs, not Satz, and
# are skipped.
#
#   scripts/parse-corpus.sh ~/projects/satz
set -euo pipefail
checkout="${1:?usage: parse-corpus.sh <satz-checkout>}"
cd "$(dirname "$0")/.."
files=$(find "$checkout/presets" "$checkout/tests" -name '*.satz' ! -name '*.diff.satz' | sort)
[[ -n "$files" ]] || { echo "parse-corpus: no .satz files under $checkout" >&2; exit 1; }
# tree-sitter parse -q prints only the files with errors and exits non-zero when any has one.
printf '%s\n' "$files" | xargs tree-sitter parse -q --stat
