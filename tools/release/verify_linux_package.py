#!/usr/bin/env python3
"""Verify a downloaded .deb against a detached OpenPGP-signed SHA256SUMS file."""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path


FINGERPRINT = re.compile(r"^(?:[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$")
CHECKSUM_LINE = re.compile(rb"^([0-9A-Fa-f]{64})  ([^\r\n]+)$")


class VerificationError(Exception):
    pass


def run_gpg(home: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gpg", "--no-options", "--batch", "--no-tty", "--homedir", str(home), *arguments],
        check=False,
        capture_output=True,
        text=True,
    )


def imported_primary_fingerprints(home: Path) -> list[str]:
    result = run_gpg(home, "--with-colons", "--fingerprint", "--list-keys")
    if result.returncode:
        raise VerificationError(result.stderr.strip() or "Could not inspect the imported key.")
    fingerprints: list[str] = []
    awaiting_primary = False
    for line in result.stdout.splitlines():
        fields = line.split(":")
        if fields[0] == "pub":
            awaiting_primary = True
        elif fields[0] == "fpr" and awaiting_primary:
            fingerprints.append(fields[9].upper())
            awaiting_primary = False
    return fingerprints


def verify_signature(
    public_key: Path, signature: Path, checksums: Path, expected_fingerprint: str
) -> None:
    with tempfile.TemporaryDirectory(prefix="aob-gpg-verify-") as temporary_home:
        home = Path(temporary_home)
        home.chmod(0o700)
        imported = run_gpg(home, "--import", str(public_key))
        if imported.returncode:
            raise VerificationError(imported.stderr.strip() or "Could not import the public key.")

        fingerprints = imported_primary_fingerprints(home)
        if fingerprints != [expected_fingerprint]:
            found = ", ".join(fingerprints) if fingerprints else "none"
            raise VerificationError(
                f"Public key fingerprint mismatch: expected {expected_fingerprint}, found {found}."
            )

        verified = run_gpg(
            home,
            "--status-fd=1",
            "--verify",
            str(signature),
            str(checksums),
        )
        if verified.returncode:
            raise VerificationError(verified.stderr.strip() or "The checksum signature is invalid.")

        valid_signatures = []
        for line in verified.stdout.splitlines():
            fields = line.split()
            if len(fields) >= 3 and fields[0] == "[GNUPG:]" and fields[1] == "VALIDSIG":
                signer = fields[2].upper()
                primary = fields[-1].upper()
                valid_signatures.append((signer, primary))
        if len(valid_signatures) != 1 or expected_fingerprint not in valid_signatures[0]:
            raise VerificationError("The manifest signature was not made by the expected key.")


def manifest_hash(checksums: Path, package_name: str) -> str:
    matches: list[str] = []
    for line_number, line in enumerate(checksums.read_bytes().splitlines(), start=1):
        match = CHECKSUM_LINE.fullmatch(line)
        if not match:
            raise VerificationError(
                f"Unsupported SHA256SUMS format on line {line_number}; expected '<sha256><two spaces><filename>'."
            )
        name = match.group(2).decode("utf-8", errors="strict")
        if Path(name).name != name or name in {".", ".."}:
            raise VerificationError(f"Manifest filenames must be basenames (line {line_number}).")
        if name == package_name:
            matches.append(match.group(1).decode("ascii").lower())
    if len(matches) != 1:
        raise VerificationError(
            f"Expected exactly one checksum for {package_name!r}; found {len(matches)}."
        )
    return matches[0]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def verify_package(
    package: Path,
    checksums: Path,
    signature: Path,
    public_key: Path,
    expected_fingerprint: str,
) -> str:
    expected = expected_fingerprint.replace(" ", "").upper()
    if not FINGERPRINT.fullmatch(expected):
        raise VerificationError("Expected fingerprint must be 40 or 64 hexadecimal characters.")
    if package.suffix.lower() != ".deb":
        raise VerificationError("The Linux release verifier accepts Debian .deb packages only.")
    for path in (package, checksums, signature, public_key):
        if not path.is_file():
            raise VerificationError(f"Required file does not exist: {path}")

    verify_signature(public_key, signature, checksums, expected)
    recorded_hash = manifest_hash(checksums, package.name)
    actual_hash = sha256_file(package)
    if actual_hash != recorded_hash:
        raise VerificationError(
            f"Package SHA-256 mismatch for {package.name}: expected {recorded_hash}, got {actual_hash}."
        )
    return actual_hash


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Verify a Linux package using SHA256SUMS, its detached OpenPGP signature, "
            "a public key, and that key's fingerprint from an independently trusted channel."
        )
    )
    parser.add_argument("package", type=Path, help="Downloaded .deb to verify")
    parser.add_argument("checksums", type=Path, help="Signed SHA256SUMS file")
    parser.add_argument("signature", type=Path, help="Detached signature for SHA256SUMS")
    parser.add_argument("public_key", type=Path, help="Release public key file")
    parser.add_argument("fingerprint", help="Expected release-key fingerprint from a trusted channel")
    arguments = parser.parse_args()
    try:
        digest = verify_package(
            arguments.package,
            arguments.checksums,
            arguments.signature,
            arguments.public_key,
            arguments.fingerprint,
        )
    except (OSError, UnicodeError, VerificationError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    print(f"Verified {arguments.package.name} (SHA-256 {digest})")
    print(f"Release key fingerprint: {arguments.fingerprint.replace(' ', '').upper()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
