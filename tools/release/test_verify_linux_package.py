import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from verify_linux_package import VerificationError, verify_package


class VerifyLinuxPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="aob-release-verifier-test-")
        cls.root = Path(cls.temporary.name)
        cls.key_home = cls.root / "test-key-home"
        cls.key_home.mkdir(mode=0o700)
        cls.fingerprint = ""
        cls.public_key = cls.root / "test-only-public-key.asc"

        subprocess.run(
            [
                "gpg",
                "--no-options",
                "--batch",
                "--pinentry-mode",
                "loopback",
                "--passphrase",
                "",
                "--homedir",
                str(cls.key_home),
                "--quick-generate-key",
                "AOB temporary verifier test key",
                "ed25519",
                "sign",
                "0",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        listing = subprocess.run(
            [
                "gpg",
                "--no-options",
                "--batch",
                "--homedir",
                str(cls.key_home),
                "--with-colons",
                "--fingerprint",
                "--list-secret-keys",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in listing.stdout.splitlines():
            fields = line.split(":")
            if fields[0] == "fpr":
                cls.fingerprint = fields[9].upper()
                break
        if not cls.fingerprint:
            raise AssertionError("GnuPG did not report the temporary test-key fingerprint")

        with cls.public_key.open("wb") as output:
            subprocess.run(
                [
                    "gpg",
                    "--no-options",
                    "--batch",
                    "--homedir",
                    str(cls.key_home),
                    "--armor",
                    "--export",
                    cls.fingerprint,
                ],
                check=True,
                stdout=output,
            )

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        self.case = tempfile.TemporaryDirectory(dir=self.root, prefix="case-")
        self.directory = Path(self.case.name)
        self.package = self.directory / "Afaan Oromo Bible_1.0_amd64.deb"
        self.package.write_bytes(b"test-only Debian package bytes\x00\xff")
        self.checksums = self.directory / "SHA256SUMS"
        digest = hashlib.sha256(self.package.read_bytes()).hexdigest()
        self.checksums.write_text(f"{digest}  {self.package.name}\n", encoding="utf-8")
        self.signature = self.directory / "SHA256SUMS.asc"
        subprocess.run(
            [
                "gpg",
                "--no-options",
                "--batch",
                "--homedir",
                str(self.key_home),
                "--armor",
                "--detach-sign",
                "--local-user",
                self.fingerprint,
                "--output",
                str(self.signature),
                str(self.checksums),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

    def tearDown(self):
        self.case.cleanup()

    def verify(self, fingerprint=None):
        return verify_package(
            self.package,
            self.checksums,
            self.signature,
            self.public_key,
            fingerprint or self.fingerprint,
        )

    def test_accepts_signature_from_expected_key_and_exact_package_hash(self):
        self.assertEqual(self.verify(), hashlib.sha256(self.package.read_bytes()).hexdigest())

    def test_cli_reports_verified_package_and_fingerprint(self):
        script = Path(__file__).with_name("verify_linux_package.py")
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                str(self.package),
                str(self.checksums),
                str(self.signature),
                str(self.public_key),
                self.fingerprint,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"Verified {self.package.name}", result.stdout)
        self.assertIn(self.fingerprint, result.stdout)

    def test_rejects_a_modified_package_after_signature_verifies(self):
        self.package.write_bytes(b"modified package")
        with self.assertRaisesRegex(VerificationError, "Package SHA-256 mismatch"):
            self.verify()

    def test_rejects_a_modified_checksum_manifest(self):
        self.checksums.write_text("0" * 64 + f"  {self.package.name}\n", encoding="utf-8")
        with self.assertRaises(VerificationError):
            self.verify()

    def test_rejects_a_public_key_with_an_untrusted_fingerprint(self):
        wrong_fingerprint = "A" * len(self.fingerprint)
        with self.assertRaisesRegex(VerificationError, "fingerprint mismatch"):
            self.verify(wrong_fingerprint)

    def test_rejects_non_debian_artifacts(self):
        other_artifact = self.directory / "afaan-oromo-bible.rpm"
        other_artifact.write_bytes(b"not a Debian package")
        with self.assertRaisesRegex(VerificationError, "Debian .deb"):
            verify_package(
                other_artifact,
                self.checksums,
                self.signature,
                self.public_key,
                self.fingerprint,
            )

    def test_rejects_duplicate_package_entries(self):
        digest = hashlib.sha256(self.package.read_bytes()).hexdigest()
        self.checksums.write_text(
            f"{digest}  {self.package.name}\n{digest}  {self.package.name}\n",
            encoding="utf-8",
        )
        self.signature.unlink()
        subprocess.run(
            [
                "gpg",
                "--no-options",
                "--batch",
                "--homedir",
                str(self.key_home),
                "--armor",
                "--detach-sign",
                "--local-user",
                self.fingerprint,
                "--output",
                str(self.signature),
                str(self.checksums),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        with self.assertRaisesRegex(VerificationError, "exactly one checksum"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
