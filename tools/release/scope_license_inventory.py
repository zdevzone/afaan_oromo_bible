#!/usr/bin/env python3
"""Scope the local license-file audit to proposed native target dependency graphs.

Cargo tree normal edges include compile-time proc macros; this is review input,
not proof that each package's code ships in the final binary.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


PACKAGE = re.compile(r"^([^ ]+) v([^ ]+)")


def scope(inventory: dict, trees: dict[str, Path]) -> dict:
    packages = {(item["name"], item["version"]): item for item in inventory["rust"]}
    result = {}
    for target, path in trees.items():
        identities = set()
        for line in path.read_text(encoding="utf-8").splitlines():
            match = PACKAGE.match(line)
            if match is None:
                raise ValueError(f"Unexpected cargo tree line for {target}.")
            identities.add((match[1], match[2]))
        identities.discard(("afaan-oromo-bible", "0.1.0"))
        unknown = identities - packages.keys()
        if unknown:
            raise ValueError(f"Cargo tree for {target} differs from the metadata inventory.")
        missing = sorted(
            [
                {"name": name, "version": version}
                for name, version in identities
                if not packages[(name, version)]["topLevelNoticeFiles"]
            ],
            key=lambda item: (item["name"], item["version"]),
        )
        result[target] = {
            "normalDependencyPackageVersions": len(identities),
            "withoutTopLevelNoticeFile": missing,
        }
    return {
        "status": "target-normal-dependency-review-input",
        "sourceLockSha256": inventory["sourceLockSha256"],
        "scope": "Cargo normal dependency edges with default desktop feature; includes compile-time proc macros; excludes build/development edges and actual binary inspection",
        "targets": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--tree", action="append", required=True,
                        help="target=path to cargo tree --edges normal output")
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Output already exists; choose a new report path.")
    trees = {}
    for item in args.tree:
        target, separator, path = item.partition("=")
        if not separator or not target or not path or target in trees:
            parser.error("Each --tree must be a distinct target=path.")
        trees[target] = Path(path)
    report = scope(json.loads(args.inventory.read_text(encoding="utf-8")), trees)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Wrote", args.out, "; ".join(
        f"{target}: {data['normalDependencyPackageVersions']} packages, "
        f"{len(data['withoutTopLevelNoticeFile'])} without top-level notice files"
        for target, data in report["targets"].items()
    ))


if __name__ == "__main__":
    main()
