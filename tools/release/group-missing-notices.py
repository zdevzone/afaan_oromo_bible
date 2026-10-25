#!/usr/bin/env python3
"""Group target-scoped missing top-level license files by upstream repository.

This is a lookup worksheet, not a license approval or bundled notice file.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def group(metadata: dict, scope: dict) -> dict:
    packages = {(item["name"], item["version"]): item for item in metadata["packages"]}
    grouped: dict[str, list[dict]] = {}
    for target, details in scope["targets"].items():
        for missing in details["withoutTopLevelNoticeFile"]:
            key = missing["name"], missing["version"]
            package = packages.get(key)
            if package is None:
                raise ValueError(f"Missing Cargo metadata for {key!r}")
            repository = package.get("repository") or "unknown"
            entries = grouped.setdefault(repository, [])
            identity = next((item for item in entries if (item["name"], item["version"]) == key), None)
            if identity is None:
                identity = {
                    "name": key[0],
                    "version": key[1],
                    "declaredLicense": package.get("license"),
                    "targets": [],
                }
                entries.append(identity)
            identity["targets"].append(target)
    return {
        "status": "upstream-notice-lookup-required",
        "sourceLockSha256": scope["sourceLockSha256"],
        "scope": "Target normal dependency packages without a top-level notice file in the local Cargo package directory; repository URLs and license expressions are unverified Cargo metadata",
        "repositories": [
            {"repository": repository, "packages": sorted(entries, key=lambda item: (item["name"], item["version"]))}
            for repository, entries in sorted(grouped.items())
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--scope", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Output already exists; choose a new report path.")
    report = group(
        json.loads(args.metadata.read_text(encoding="utf-8")),
        json.loads(args.scope.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {len(report['repositories'])} upstream repositories")


if __name__ == "__main__":
    main()
