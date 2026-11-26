#!/usr/bin/env bash
# check-authors.sh — refuses a commit whose author or committer is not a GitHub
# noreply address. The repository is public, history included, and an address in
# a commit is a personal datum that never comes out again.
#
#   scripts/check-authors.sh --staged           # the identity about to commit (pre-commit hook)
#   scripts/check-authors.sh --commits A..B     # every commit of a range (CI)
#
# Allowed: <id>+<login>@users.noreply.github.com, and noreply@github.com, the
# committer GitHub writes on a squash merge. $NAMES_IDENT, set in a local clone and
# never in CI, is an extended regex of one more address that may author or commit.
# No personal address is written here: this file is public.
#
# bash 3.2 compatible (macOS default).
set -uo pipefail

ALLOW='[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com|noreply@github\.com'
[[ -z "${NAMES_IDENT:-}" ]] || ALLOW="$ALLOW|$NAMES_IDENT"

allowed() { printf '%s\n' "$1" | grep -q -E "^($ALLOW)$"; }

refuse() { # $1 what was found, one row per offending identity
  cat >&2 <<MSG
check-authors: an author or committer is not a GitHub noreply address:
$(printf '%s\n' "$1" | sed 's/^/    /')
Fix it:
    git config user.email <id>+<login>@users.noreply.github.com
    git commit --amend --reset-author --no-edit     # the last commit
    git rebase --exec 'git commit --amend --reset-author --no-edit' origin/main   # every commit of a branch
(GitHub shows the address under Settings > Emails > "Keep my email addresses private".)
MSG
  exit 1
}

case "${1:-}" in
  --staged)
    a=$(git var GIT_AUTHOR_IDENT | sed 's/.*<\(.*\)>.*/\1/')
    c=$(git var GIT_COMMITTER_IDENT | sed 's/.*<\(.*\)>.*/\1/')
    bad=""
    allowed "$a" || bad="${bad}author    $a"$'\n'
    allowed "$c" || bad="${bad}committer $c"$'\n'
    [[ -z "$bad" ]] || refuse "${bad%$'\n'}"
    ;;
  --commits)
    range="${2:?usage: check-authors.sh --commits A..B}"
    # an unusable range must FAIL, not pass with nothing checked
    for r in "${range%%..*}" "${range##*..}"; do
      git rev-parse --verify --quiet "$r^{commit}" >/dev/null \
        || { echo "check-authors: unusable commit range '$range' ($r does not resolve)" >&2; exit 1; }
    done
    bad=$(git log --format='%h %ae %ce' "$range" | while read -r h a c; do
      if ! allowed "$a" || ! allowed "$c"; then echo "$h author $a committer $c"; fi
    done)
    [[ -z "$bad" ]] || refuse "$bad"
    echo "check-authors: $(git rev-list --count "$range") commit(s) in $range, all noreply"
    ;;
  *)
    echo "usage: check-authors.sh --staged | --commits A..B" >&2
    exit 2
    ;;
esac
