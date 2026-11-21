#!/usr/bin/env python3
"""Point Syrex 3.7 Discord Rich Presence large image at the original hosted GIF."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
target = root / "src/main/java/syrux/client/module/misc/DiscordRPCModule.java"
original = target.read_text(encoding="utf-8")
gif = "https://raw.githubusercontent.com/hhhfff0056-crypto/syrex-client/main/assets/syrex-rpc.gif"

patched, count = re.subn(
    r'presence\.largeImageKey\s*=\s*"[^"]*";',
    f'presence.largeImageKey = "{gif}";',
    original,
)
if count != 1:
    raise RuntimeError(f"Expected 1 DiscordRPC large image reference, found {count} in {target}")
target.write_text(patched, encoding="utf-8")
assert gif in target.read_text(encoding="utf-8")
print(f"Discord RPC now uses original animated S GIF: {gif}")
