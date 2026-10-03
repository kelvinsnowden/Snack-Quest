"""Every implementation must reproduce every official test vector. Run: python3 -m unittest sdk/python/test_signing_vectors.py"""
import json
import os
import unittest

from snack_quest_machine import canonical_string, signature_header

VECTORS = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "machine-api", "signing-test-vectors.json")


class SigningVectors(unittest.TestCase):
    def test_every_vector(self):
        with open(VECTORS, encoding="utf-8") as handle:
            spec = json.load(handle)
        self.assertGreaterEqual(len(spec["vectors"]), 5)
        for vector in spec["vectors"]:
            with self.subTest(vector["name"]):
                body = bytes.fromhex(vector["bodyUtf8Hex"])
                canonical = canonical_string(vector["method"], vector["pathWithQuery"], int(vector["timestamp"]), vector["nonce"], body)
                self.assertEqual(canonical, vector["canonical"])
                self.assertEqual(signature_header(spec["secret"], canonical), vector["signatureHeader"])


if __name__ == "__main__":
    unittest.main()
