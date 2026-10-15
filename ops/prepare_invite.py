"""Prepare the reviewed invite-account Compose cutover on the single ECS host.

This script writes next-version files but never restarts the public service.
Run it as root on the LibreTV ECS after pulling the pinned image.
"""

import os
import re
import secrets
import shutil
import time
from pathlib import Path


BASE = Path("/opt/libretv")
BACKUP = BASE / "backups/invite-20261016"
IMAGE = (
    "ghcr.io/lilinjie05241515-afk/libretv@"
    "sha256:27e43fea06194589928c16fe296bb2a040a251b7908b0c6c8da5198175788ddf"
)

old = (BASE / "compose.yaml").read_text(encoding="utf-8")
old_env = (BASE / ".env").read_text(encoding="utf-8")
if "ghcr.io/librespark/libretv:2.16.12" not in old:
    raise SystemExit("Expected v2.16.12 Compose; no files changed")
if [line.split("=", 1)[0] for line in old_env.splitlines() if line] != ["PASSWORD"]:
    raise SystemExit("Unexpected .env keys; no files changed")
source_lines = re.findall(r"^      DEFAULT_SOURCES: .+$", old, re.MULTILINE)
if len(source_lines) != 1:
    raise SystemExit("Expected one DEFAULT_SOURCES line; no files changed")

BACKUP.mkdir(parents=True, exist_ok=True)
shutil.copy2(BASE / "compose.yaml", BACKUP / "pre-cutover-compose.yaml")
shutil.copy2(BASE / ".env", BACKUP / "pre-cutover.env")
os.chmod(BACKUP / "pre-cutover.env", 0o600)

compose = "\n".join(
    [
        "services:",
        "  libretv:",
        f"    image: {IMAGE}",
        "    container_name: libretv",
        "    restart: unless-stopped",
        "    ports:",
        "      - '127.0.0.1:8080:8080'",
        "    volumes:",
        "      - libretv-data:/app/data",
        "    environment:",
        "      AUTH_MODE: accounts",
        "      PUBLIC_ORIGIN: https://tv.luoxiaoji-task.top",
        "      PROXY_SECRET: ${PROXY_SECRET:?Set PROXY_SECRET in .env}",
        "      BOOTSTRAP_TOKEN: ${BOOTSTRAP_TOKEN:-}",
        "      BOOTSTRAP_TOKEN_EXPIRES_AT: ${BOOTSTRAP_TOKEN_EXPIRES_AT:-}",
        "      LIBRETV_DB_PATH: /app/data/accounts.sqlite",
        source_lines[0],
        "volumes:",
        "  libretv-data:",
        "",
    ]
)
(BASE / "compose.next.yaml").write_text(compose, encoding="utf-8")
next_env = "\n".join(
    [
        f"PROXY_SECRET={secrets.token_hex(32)}",
        f"BOOTSTRAP_TOKEN={secrets.token_hex(32)}",
        f"BOOTSTRAP_TOKEN_EXPIRES_AT={int(time.time() * 1000) + 30 * 60 * 1000}",
        "",
    ]
)
(BASE / ".env.next").write_text(next_env, encoding="utf-8")
os.chmod(BASE / ".env.next", 0o600)
print("Prepared compose.next.yaml and .env.next; public service unchanged")
