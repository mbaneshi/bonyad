#!/usr/bin/env bash
# Golden test: the generator, run on catalogue/_golden/acad, must produce tables structurally
# identical to the hand-written acad tables of db/migrations/20261023000005_phase1_entity_spine.sql.
#
# Two scratch databases are created in the local container and dropped afterwards (also on failure):
#   ref  = the whole migration 20261023000005
#   gen  = the migration's `core` part (everything before the acad section) + the generated acad.sql
# Both are fingerprinted from the catalogue views (columns, types, nullability, defaults, constraints,
# triggers; see schema-fingerprint.sql) and the fingerprints must be equal. The real database
# (`postgres`) is never touched.
#
#   tools/catalogue/scripts/golden-equivalence.sh        (container name: $BONYAD_DB_CONTAINER, default bonyad-db)
set -euo pipefail
unset CDPATH

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
container="${BONYAD_DB_CONTAINER:-bonyad-db}"
migration="$root/db/migrations/20261023000005_phase1_entity_spine.sql"
suffix="$$"
ref="catalogue_ref_$suffix"
gen="catalogue_gen_$suffix"
work="$(mktemp -d)"

psql_admin() { docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_db() { local db="$1"; shift; docker exec -i "$container" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }
cleanup() {
    psql_admin -c "drop database if exists $ref with (force)" >/dev/null 2>&1 || true
    psql_admin -c "drop database if exists $gen with (force)" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT

echo "== generate the golden schema"
(cd "$root/tools/catalogue" && for f in acad features; do bun src/cli.ts generate "$root/catalogue/_golden/$f" --out "$work" >/dev/null; done)
generated="$work/db/generated/_golden/acad/acad.sql"
[ -f "$generated" ] || { echo "generator produced no acad.sql" >&2; exit 1; }

echo "== scratch databases $ref and $gen"
psql_admin -c "create database $ref" -c "create database $gen"

marker="-- ------------------------------------------------------------------ acad (pilot)"
line="$(grep -nF -- "$marker" "$migration" | head -1 | cut -d: -f1)"
[ -n "$line" ] || { echo "cannot find the acad section marker in the migration" >&2; exit 1; }

psql_db "$ref" <"$migration"
head -n "$((line - 1))" "$migration" | psql_db "$gen"
psql_db "$gen" <"$generated"

# The seed rows must apply, and apply again without error or duplicates (idempotent).
seed="$work/db/generated/_golden/acad/acad.catalogue.sql"
psql_db "$gen" <"$seed"
first="$(psql_db "$gen" -At -c "select (select count(*) from core.source) || '/' || (select count(*) from core.entity_type) || '/' || (select count(*) from core.field_doc)")"
psql_db "$gen" <"$seed"
second="$(psql_db "$gen" -At -c "select (select count(*) from core.source) || '/' || (select count(*) from core.entity_type) || '/' || (select count(*) from core.field_doc)")"
# The second fixture (multi-level hierarchy, type_code discriminators, every field type) must apply and behave.
for part in features features.catalogue; do
    psql_db "$gen" <"$work/db/generated/_golden/features/$part.sql"
done
psql_db "$gen" <"$here/features-smoke.sql" 2>&1 | grep -E "smoke ok" || { echo "features smoke failed" >&2; exit 1; }
echo "== features fixture applied and smoke-tested"

echo "== seed rows (source/entity_type/field_doc): first run $first, second run $second"
[ "$first" = "$second" ] || { echo "seed is not idempotent" >&2; exit 1; }

psql_db "$ref" -At -v schema=acad -f - <"$here/schema-fingerprint.sql" >"$work/ref.txt"
psql_db "$gen" -At -v schema=acad -f - <"$here/schema-fingerprint.sql" >"$work/gen.txt"

# The order of values inside "x in (...)" lists is not significant: sort those lists on both sides.
sort_lists() { perl -pe 's/ARRAY\[([^\]]*)\]/"ARRAY[" . join(", ", sort split(m{, }, $1)) . "]"/e' "$1" >"$1.sorted" && mv "$1.sorted" "$1"; }
sort_lists "$work/ref.txt"
sort_lists "$work/gen.txt"

count() { grep -c "^$1" "$2" || true; }
echo "== fingerprint sizes (reference | generated)"
for kind in column constraint trigger; do
    echo "   $kind: $(count "$kind" "$work/ref.txt") | $(count "$kind" "$work/gen.txt")"
done
echo "   tables: $(grep '^column' "$work/ref.txt" | sed -E 's/^column +([^.]+)\..*/\1/' | sort -u | wc -l | tr -d ' ') | $(grep '^column' "$work/gen.txt" | sed -E 's/^column +([^.]+)\..*/\1/' | sort -u | wc -l | tr -d ' ')"
for c in p f c u; do
    echo "   constraints type $c: $(grep -c "^constraint [a-z0-9_]* $c " "$work/ref.txt" || true) | $(grep -c "^constraint [a-z0-9_]* $c " "$work/gen.txt" || true)"
done

if diff -u "$work/ref.txt" "$work/gen.txt" >"$work/diff.txt"; then
    echo "== EQUIVALENT: the generated acad tables match migration 20261023000005 ($(wc -l <"$work/ref.txt" | tr -d ' ') fingerprint lines)"
else
    echo "== DIFFERENT:" >&2
    cat "$work/diff.txt" >&2
    exit 1
fi
