"""Deploy dist/ to a static-hosting git branch (e.g. GitHub Pages).

    python3 -m tools deploy --remote git@github.com:OWNER/REPO.git [--branch gh-pages]

Only the contents of dist/ are pushed: the target branch is checked out in a
temporary directory, all its files are replaced by dist/, and the result is
committed on top of the existing history and pushed (never force-pushed).

Safety
* dist/ must pass the production release check again right before pushing.
* A target branch that contains repository source (tools/, content/, private/ …)
  is refused, so this can never overwrite the source repository's main branch.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from .common import Paths, ToolError, now_iso
from .release_check import release_check

SOURCE_MARKERS = ("tools/", "content/", "private/", "web/", "tests/", "README.md", ".gitignore")


def _git(args: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    res = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise ToolError(f"git {' '.join(args)} failed:\n{res.stderr.strip() or res.stdout.strip()}")
    return res


def deploy(paths: Paths, remote: str, *, branch: str = "gh-pages", yes: bool = False,
           dry_run: bool = False) -> dict[str, Any]:
    dist = paths.dist
    if not (dist / "index.html").exists():
        raise ToolError("dist/ has no build; run `python3 -m tools publish` first")
    report = release_check(dist, paths, expect_mode="production")
    if report["errors"]:
        raise ToolError("dist/ fails the release check; not deploying:\n  " + "\n  ".join(report["errors"]))
    bank = json.loads((dist / "data" / "bank.json").read_text(encoding="utf-8"))
    n_questions = len(bank["questions"])

    work = Path(tempfile.mkdtemp(prefix="radioquiz-deploy-"))
    try:
        _git(["init", "-q"], work)
        exists = _git(["ls-remote", "--exit-code", "--heads", remote, branch], work, check=False).returncode == 0
        if exists:
            _git(["fetch", "-q", "--depth", "1", remote, branch], work)
            _git(["checkout", "-q", "-b", branch, "FETCH_HEAD"], work)
            tracked = _git(["ls-files"], work).stdout.splitlines()
            suspicious = sorted({m for f in tracked for m in SOURCE_MARKERS if f == m or f.startswith(m)})
            if suspicious:
                raise ToolError(f"{remote} {branch} contains repository source ({', '.join(suspicious)}); "
                                "refusing to overwrite it. Deploy to a branch or repository that holds only the site.")
            for p in work.iterdir():
                if p.name != ".git":
                    shutil.rmtree(p) if p.is_dir() else p.unlink()
        else:
            _git(["checkout", "-q", "--orphan", branch], work)
        shutil.copytree(dist, work, dirs_exist_ok=True)
        _git(["add", "-A"], work)
        status = _git(["status", "--porcelain"], work).stdout.strip()
        if not status:
            return {"status": "unchanged", "remote": remote, "branch": branch, "questions": n_questions}
        summary = (f"Deploy {n_questions} approved question(s), bank {bank['bank_id']}, to {remote} "
                   f"branch {branch}{'' if exists else ' (new branch)'}; {len(status.splitlines())} file change(s).")
        if dry_run:
            return {"status": "dry_run", "summary": summary, "changes": status.splitlines()}
        if not yes:
            if not sys.stdin.isatty():
                raise ToolError(summary + "\nConfirm with --yes (non-interactive).")
            if input(summary + "\nPush? [j/N] ").strip().lower() not in ("j", "ja", "y", "yes"):
                return {"status": "cancelled"}
        _git(["commit", "-q", "-m", f"Deploy bank {bank['bank_id']} ({n_questions} questions) {now_iso()}"], work)
        _git(["push", "-q", remote, f"HEAD:refs/heads/{branch}"], work)
        return {"status": "pushed", "summary": summary}
    finally:
        shutil.rmtree(work, ignore_errors=True)
