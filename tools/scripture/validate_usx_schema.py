"""Validate every USX member of a source ZIP against a local Relax NG schema.

Requires lxml in the invoking Python environment. Keep the schema and source ZIP
outside public assets; this diagnostic does not approve content for distribution.
"""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

from lxml import etree


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--archive-sha256", required=True)
    parser.add_argument("--schema", type=Path, required=True)
    parser.add_argument("--schema-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    archive_hash = sha256(args.archive)
    schema_hash = sha256(args.schema)
    if archive_hash != args.archive_sha256 or schema_hash != args.schema_sha256:
        parser.error("archive or schema SHA-256 does not match the expected value")

    xml_parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
    schema = etree.RelaxNG(etree.parse(str(args.schema), xml_parser))
    passed = 0
    failures = []
    with ZipFile(args.archive) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".usx")]
        if not members or len(members) != len(set(members)):
            parser.error("archive has no USX members or duplicate USX paths")
        for name in sorted(members):
            try:
                document = etree.fromstring(archive.read(name), xml_parser)
                valid = schema.validate(document)
            except (etree.XMLSyntaxError, ValueError) as error:
                failures.append({"member": name, "errors": [str(error).splitlines()[0]]})
                continue
            if valid:
                passed += 1
            else:
                failures.append({
                    "member": name,
                    "errors": [f"line {error.line}: {error.message}" for error in schema.error_log[:5]],
                })

    report = {
        "archiveSha256": archive_hash,
        "schemaSha256": schema_hash,
        "validator": f"lxml {etree.LXML_VERSION}",
        "members": len(members),
        "passed": passed,
        "failed": len(failures),
        "failures": failures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"USX Relax NG: {passed}/{len(members)} passed; report: {args.out}")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
