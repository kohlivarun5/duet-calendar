#!/usr/bin/env python3
"""Stage tracked public website files without publishing backend code or keys."""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile


EXCLUDED_PARTS = {
    "workers", "node_modules", "scripts", "docs", "_site", "__pycache__",
    "tests", "test", "backend", "functions",
}
PUBLIC_SUFFIXES = {
    ".html", ".css", ".js", ".xml", ".txt", ".svg", ".png", ".jpg",
    ".jpeg", ".webp", ".gif", ".ico", ".avif", ".woff", ".woff2",
    ".ttf", ".otf", ".mp4", ".webm", ".pdf", ".webmanifest",
}
SENSITIVE_SUFFIXES = {".p8", ".pem", ".key", ".p12", ".pfx", ".der", ".keystore"}
SENSITIVE_NAME = re.compile(r"(?:^|[-_.])(?:credentials?|secrets?|private[-_]?key)(?:[-_.]|$)", re.I)
PRIVATE_KEY_MARKER = re.compile(rb"-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-----")


class StagingError(ValueError):
    pass


def public_path(name: str) -> PurePosixPath | None:
    """Classify a Git path; unknown file types never become public by default."""
    relative = PurePosixPath(name)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts or "\\" in name:
        raise StagingError(f"Unsafe tracked path: {name!r}")
    if any(part.startswith(".") or part in EXCLUDED_PARTS for part in relative.parts):
        return None
    if relative.suffix.lower() in SENSITIVE_SUFFIXES or SENSITIVE_NAME.search(relative.name):
        raise StagingError(f"Credential-like file outside an excluded directory: {name}")
    if name == "CNAME" or relative.suffix.lower() in PUBLIC_SUFFIXES:
        return relative
    # Keep the existing published campaign reference/keyword URLs working.
    if relative.parts[0] == "ads" and relative.suffix.lower() in {".md", ".csv"}:
        return relative
    if relative.parts[0] in {"assets", "ads"}:
        raise StagingError(f"Unrecognized public asset type: {name}")
    return None


def tracked_public_files(repository: Path) -> list[tuple[PurePosixPath, Path]]:
    listing = subprocess.run(
        ["git", "ls-files", "--stage", "-z"], cwd=repository,
        check=True, stdout=subprocess.PIPE,
    ).stdout
    files: list[tuple[PurePosixPath, Path]] = []
    for row in listing.split(b"\0"):
        if not row:
            continue
        metadata, raw_name = row.split(b"\t", 1)
        mode, _, stage = metadata.split(b" ")
        name = os.fsdecode(raw_name)
        if stage != b"0":
            raise StagingError(f"Unmerged tracked file: {name}")
        if mode not in {b"100644", b"100755"}:
            raise StagingError(f"Tracked symlinks and submodules are not publishable: {name}")
        relative = public_path(name)
        if relative is None:
            continue
        source = repository.joinpath(*relative.parts)
        if source.resolve(strict=True) != source:
            raise StagingError(f"Public file uses a symlink or escapes the repository: {name}")
        if not stat.S_ISREG(source.stat().st_mode):
            raise StagingError(f"Public path is not a regular file: {name}")
        files.append((relative, source))
    if not any(str(relative) == "index.html" for relative, _ in files):
        raise StagingError("A tracked root index.html is required")
    return files


def read_public_file(repository: Path, relative: PurePosixPath) -> bytes:
    """Open each component without following symlinks, including during a race."""
    directory = os.open(repository, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in relative.parts[:-1]:
            nested = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = nested
        descriptor = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        with os.fdopen(descriptor, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise StagingError(f"Public path is not a regular file: {relative}")
            return handle.read()
    finally:
        os.close(directory)


def stage_site(repository: Path) -> int:
    repository = repository.resolve(strict=True)
    destination = repository / "_site"
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise StagingError("_site must be a real directory, not a symlink or file")
    files = tracked_public_files(repository)
    with tempfile.TemporaryDirectory(prefix=".pages-stage-", dir=repository) as temporary:
        staging = Path(temporary) / "site"
        staging.mkdir()
        for relative, _ in files:
            content = read_public_file(repository, relative)
            if PRIVATE_KEY_MARKER.search(content):
                raise StagingError(f"Private-key material in public file: {relative}")
            target = staging.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        # Validate everything before atomically installing the new directory.
        previous = Path(temporary) / "previous"
        if destination.exists():
            destination.replace(previous)
        try:
            staging.replace(destination)
        except OSError:
            if previous.exists():
                previous.replace(destination)
            raise
    return len(files)


if __name__ == "__main__":
    try:
        count = stage_site(Path(__file__).resolve().parents[1])
    except (StagingError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Pages staging failed: {error}") from error
    print(f"Staged {count} tracked public files in _site/")
