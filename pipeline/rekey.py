"""Change the library passphrase: re-encrypt everything in app/library with a key from the new one.

usage: .venv/bin/python pipeline/rekey.py "<new passphrase>"

Files get new content-hash names, so phones never mix a cached old-key file with the new key; the app
notices the old saved key no longer opens the library and asks for the new passphrase once.
"""
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish as pub  # noqa: E402


def main(new_pass: str):
    old_key = pub.vault_key()  # also verifies the current passphrase still opens the vault
    salt = os.urandom(16)
    new_key = hashlib.pbkdf2_hmac("sha256", new_pass.encode(), salt, pub.ITERATIONS, 32)
    reenc = lambda blob: pub.encrypt(new_key, pub.decrypt(old_key, blob))  # noqa: E731

    for book_dir in [d for d in pub.LIB.iterdir() if d.is_dir()]:
        manifest_file = book_dir / "book.enc"
        manifest = json.loads(pub.decrypt(old_key, manifest_file.read_bytes()))
        for t in manifest["tracks"]:
            t["file"] = pub.hashed(book_dir, t["id"], reenc((book_dir / t["file"]).read_bytes()))
        if manifest.get("cover"):
            manifest["cover"] = pub.hashed(book_dir, "cover", reenc((book_dir / manifest["cover"]).read_bytes()))
        manifest_file.write_bytes(pub.encrypt(new_key, json.dumps(manifest, ensure_ascii=False).encode()))
        print(f"re-encrypted {manifest['title']}: {len(manifest['tracks'])} tracks")

    index_file = pub.LIB / "index.enc"
    index_file.write_bytes(reenc(index_file.read_bytes()))
    (pub.LIB / "vault.json").write_text(json.dumps({
        "v": 1, "kdf": "PBKDF2-SHA256", "iter": pub.ITERATIONS, "salt": base64.b64encode(salt).decode(),
        "check": base64.b64encode(pub.encrypt(new_key, b"audiolivros")).decode()}))
    pub.SECRET.write_text(new_pass + "\n")
    pub.vault_key()  # sanity: the new passphrase opens the new vault
    print("passphrase changed")


if __name__ == "__main__":
    main(sys.argv[1])
