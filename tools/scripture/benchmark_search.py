#!/usr/bin/env python3
"""Measure the native search SQL against an internal technical content pack.

This is a SQLite diagnostic, not the packaged-app V1 performance gate.
The report contains timings and query-set hashes, never source text or tokens.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sqlite3
import statistics
import time
from pathlib import Path


COUNT_SQL = ("SELECT count(*) FROM verse_search CROSS JOIN verse_unit v "
             "ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 "
             "AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3)")
PAGE_SQL = ("SELECT v.unit_key FROM verse_search JOIN verse_unit v "
            "ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 "
            "AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3) "
            "ORDER BY v.book_order,v.chapter_order,v.unit_order LIMIT 50 OFFSET 0")


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def hardware() -> dict:
    details = {"cpuModel": platform.processor() or "unknown", "memoryMiB": None}
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.exists():
        for line in cpuinfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("model name"):
                details["cpuModel"] = line.split(":", 1)[1].strip()
                break
    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("MemTotal:"):
                details["memoryMiB"] = round(int(line.split()[1]) / 1024)
                break
    return details


def benchmark(database: Path, query_count: int) -> dict:
    if query_count < 1:
        raise ValueError("Query count must be positive.")
    database_hash = hashlib.sha256(database.read_bytes()).hexdigest()
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    try:
        manifest = connection.execute(
            "SELECT approval_status,edition_id,source_archive_sha256,search_profile_version "
            "FROM content_manifest"
        ).fetchone()
        if manifest is None or manifest[0] != "technical_only":
            raise ValueError("Expected an internal technical-only content pack.")
        edition_id = manifest[1]
        connection.execute("CREATE VIRTUAL TABLE temp.search_vocab USING fts5vocab(main,verse_search,'row')")
        tokens = [row[0] for row in connection.execute(
            "SELECT term FROM search_vocab WHERE length(term)>=2 ORDER BY doc DESC,term LIMIT ?",
            (query_count,),
        )]
        if len(tokens) != query_count:
            raise ValueError("The content pack has too few search terms.")
        # The production compiler quotes literal tokens before passing them to FTS5.
        expressions = ['"' + token.replace('"', '""') + '"' for token in tokens]
        timings: list[float] = []
        match_counts: list[int] = []
        for expression in expressions:
            connection.execute(COUNT_SQL, (expression, edition_id, None)).fetchone()
            connection.execute(PAGE_SQL, (expression, edition_id, None)).fetchall()
        for expression in expressions:
            started = time.perf_counter_ns()
            count = connection.execute(COUNT_SQL, (expression, edition_id, None)).fetchone()[0]
            items = connection.execute(PAGE_SQL, (expression, edition_id, None)).fetchall()
            timings.append((time.perf_counter_ns() - started) / 1_000_000)
            if len(items) != min(count, 50):
                raise ValueError("Search count and first page disagree.")
            match_counts.append(count)
        return {
            "scope": "warmed SQLite count plus first 50 rows; excludes IPC, rendering and launch",
            "approvalStatus": manifest[0],
            "editionId": edition_id,
            "sourceArchiveSha256": manifest[2],
            "searchProfileVersion": manifest[3],
            "databaseSha256": database_hash,
            "sqliteVersion": sqlite3.sqlite_version,
            "pythonVersion": platform.python_version(),
            "system": platform.platform(),
            "machine": platform.machine(),
            "hardware": hardware(),
            "queryCount": query_count,
            "querySetSha256": hashlib.sha256(json.dumps(tokens, ensure_ascii=False).encode()).hexdigest(),
            "matchCounts": {"min": min(match_counts), "median": statistics.median(match_counts),
                            "max": max(match_counts)},
            "latencyMs": {"min": min(timings), "median": statistics.median(timings),
                          "p95": percentile(timings, 0.95), "max": max(timings)},
        }
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--queries", type=int, default=50)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Output already exists; choose a new report path.")
    report = benchmark(args.database, args.queries)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: median {report['latencyMs']['median']:.2f} ms, "
          f"p95 {report['latencyMs']['p95']:.2f} ms")


if __name__ == "__main__":
    main()
