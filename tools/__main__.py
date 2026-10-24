"""Command-line entry point: python3 -m tools <command> ...

Pipeline (all offline):
  import      Stage 0  import the digitization exports into private/imported/
  sources     helpers  list/show imported source chunks (private, terminal only)
  new         Stage A  create a manual draft question mapped to source chunks
  generate    Stage A  generate LLM draft candidates (provider-configured, off by default)
  verify      Stage B  automated checks; draft -> needs_review when they pass
  review      Stage C  show / approve / reject / request-changes / edit / retire / resolve-flag
  glossary    Stage C  approve glossary terms; suggest/autolink glossary links
  visuals     Stage C  approve visual template versions
  chapters    Stage C  verify chapter and section headings
  preview     private preview site with drafts (private/preview/, never deploy)
  publish     Stage D  build dist/ from approved content only (fail closed; CI deploys it)
  deploy      push dist/ to a separate static-hosting repository (unused; see docs)
  release-check        scan a build directory for private material
  serve                serve dist/ (or the preview) on localhost
  status               overview of the bank
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .common import ToolError, eprint, paths_from_env


def _print_json(data) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def cmd_import(paths, a) -> int:
    from .importer import run_import
    res = run_import(paths, Path(a.source), dry_run=a.dry_run, force=a.force, copy_figures=not a.no_figures)
    d = res["diagnostics"]
    for e in d.errors:
        eprint(f"ERROR   {e}")
    for w in d.warnings:
        eprint(f"warning {w}")
    if a.verbose:
        for i in d.info:
            eprint(f"info    {i}")
    if res["status"] == "invalid":
        eprint("import refused: the source does not match what the importer needs (nothing written)")
        return 2
    print(f"{res['status']}: {res.get('import_id')}")
    if res.get("diff_summary"):
        print("changes:", res["diff_summary"])
    for line in res.get("log", [])[:200 if a.verbose else 15]:
        print("  " + line)
    if res.get("flagged"):
        print("question revisions flagged for re-review:")
        for t in res["flagged"]:
            print("  " + t)
    if res.get("report"):
        print(f"report: {res['report']}")
    return 0


def cmd_sources(paths, a) -> int:
    from .generate import list_sources, show_source
    print(show_source(paths, a.ref) if a.action == "show" else list_sources(paths, a.chapter, a.important))
    return 0


def cmd_new(paths, a) -> int:
    from .generate import new_manual
    qid = new_manual(paths, a.chunk, style=a.style, author=a.author)
    print(f"created content/questions/{qid}.json (draft). Fill in the TODOs, then: python3 -m tools verify {qid}")
    return 0


def cmd_generate(paths, a) -> int:
    from .generate import generate
    res = generate(paths, a.chunk or [], count=a.count, extra=a.instruction, question=a.question)
    print(f"run {res['run_id']}: created {', '.join(res['created']) or 'nothing'} (status draft)")
    print("next: python3 -m tools verify " + " ".join(c.split()[0] for c in res["created"]))
    return 0


def cmd_verify(paths, a) -> int:
    from .review import verify
    failures = verify(paths, a.ids or None)
    return 1 if failures and a.strict else 0


def cmd_review(paths, a) -> int:
    from . import review
    if a.action == "show":
        print(review.show(paths, a.id, a.revision, with_source=not a.no_source))
    elif a.action == "approve":
        res = review.approve(paths, a.id, reviewer=a.reviewer, note=a.note,
                             ack=[x for x in (a.ack or "").split(",") if x], checklist=a.checklist)
        print(f"approved {res['approved']}")
        if res["dependencies_not_approved"]:
            print("before publishing, also approve: " + ", ".join(res["dependencies_not_approved"]))
    elif a.action in ("reject", "request-changes", "retire", "reopen"):
        print(review.set_status(paths, a.id, a.action, reviewer=a.reviewer, note=a.note))
    elif a.action == "edit":
        print(review.edit(paths, a.id, reviewer=a.reviewer, note=a.note))
    elif a.action == "new-revision":
        rev = review.new_revision(paths, a.id, reviewer=a.reviewer, note=a.note)
        print(f"{a.id} r{rev['revision']} created as draft")
    elif a.action == "resolve-flag":
        print(review.resolve_flag(paths, a.id, reviewer=a.reviewer, note=a.note, demote=a.demote))
    return 0


def cmd_glossary(paths, a) -> int:
    from . import review
    from .context import load_glossary, validate_glossary
    if a.action == "check":
        errs = validate_glossary(load_glossary(paths))
        for e in errs:
            print(e)
        return 1 if errs else 0
    if a.action == "suggest":
        from .glossary_link import suggest
        print(suggest(paths, a.ids or None))
        return 0
    if a.action == "autolink":
        from .glossary_link import autolink
        from .review import _reviewer
        res = autolink(paths, a.ids or None, apply=a.apply, actor=_reviewer(a.reviewer))
        for qid, added in res["changed"]:
            print(f"{qid}: {', '.join(added)}")
        for qid, held in res["held_back"].items():
            print(f"{qid}: shown only after answering (definition would reveal the answer): {', '.join(held)}")
        print(f"{len(res['changed'])} question(s) {'updated (new draft revisions)' if a.apply else 'would change; run with --apply'}")
        return 0
    if a.action == "list":
        for t in load_glossary(paths).values():
            print(f"{t['id']:<28} [{t['status']}] {t['nb']} = {t['en']}")
        return 0
    print("approved:", ", ".join(review.approve_terms(paths, a.ids, reviewer=a.reviewer, note=a.note)))
    return 0


def cmd_visuals(paths, a) -> int:
    from . import review
    from .visuals import load_templates
    if a.action == "list":
        for key, t in load_templates(paths).items():
            print(f"{key:<20} [{t['status']}] {t['title']} — {t['description']}")
        return 0
    print("approved:", review.approve_template(paths, a.key, reviewer=a.reviewer, note=a.note,
                                               checklist=a.checklist))
    return 0


def cmd_chapters(paths, a) -> int:
    from . import review, structure
    from .importer import load_import
    if a.action == "list":
        reg = structure.load_registry(paths)
        ocr = structure.ocr_titles(load_import(paths))  # private; shown in the terminal only
        for ch in reg["chapters"]:
            print(f"Kapittel {ch['number']}: {ch.get('title')} [{ch.get('title_status')}] "
                  f"{'scanned' if ch.get('scanned') else 'not scanned'}")
            for s in ch.get("sections", []):
                shown = s.get("title") if s.get("title_status") == "verified" else structure.propose_title(ocr.get(s["id"]))
                warn = f"  OCR {s.get('ocr_issues')}" if s.get("ocr_quality") == "suspect" else ""
                print(f"    {s['id']:<8} [{s.get('title_status')}] {shown!r}  OCR: {ocr.get(s['id'])!r}{warn}")
        return 0
    if a.action == "verify-section":
        print(review.verify_section(paths, a.target, title=a.title, reviewer=a.reviewer))
    else:
        print(review.verify_chapter(paths, int(a.target), title=a.title, reviewer=a.reviewer))
    return 0


def cmd_publish(paths, a) -> int:
    from .publish import publish
    res = publish(paths, skip_flagged=a.skip_flagged, require_source=not a.without_source)
    print(f"published {res['questions']} approved question(s) to {res['out']}")
    for ch in res["chapters"]:
        print(f"  kapittel {ch['number']:>2}: {ch['status']:<13} {ch['questions']} spørsmål")
    for n in res["notes"] + res["release_check"]["notes"]:
        print("  note: " + n)
    return 0


def cmd_preview(paths, a) -> int:
    from .publish import preview
    res = preview(paths)
    print(f"preview with {res['questions']} question(s) written to {res['out']} (PRIVATE – do not deploy)")
    for p in res["problems"] + res["notes"]:
        print("  " + p)
    print("serve it with: python3 -m tools serve --preview")
    return 0


def cmd_deploy(paths, a) -> int:
    from .deploy import deploy
    res = deploy(paths, a.remote, branch=a.branch, yes=a.yes, dry_run=a.dry_run)
    print(res.get("summary") or "")
    for c in res.get("changes", [])[:50]:
        print("  " + c)
    print(res["status"])
    return 0


def cmd_release_check(paths, a) -> int:
    from .release_check import release_check
    root = Path(a.dir) if a.dir else paths.dist
    res = release_check(root, paths, expect_mode=a.mode)
    for e in res["errors"]:
        print("ERROR " + e)
    for n in res["notes"]:
        print("note  " + n)
    print("release check " + ("FAILED" if res["errors"] else "passed"))
    return 2 if res["errors"] else 0


def cmd_serve(paths, a) -> int:
    import functools
    import http.server
    root = paths.preview if a.preview else paths.dist
    if not (root / "index.html").exists():
        raise ToolError(f"{root} has no build; run `python3 -m tools {'preview' if a.preview else 'publish'}` first")
    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                          ".js": "text/javascript", ".woff2": "font/woff2"}

    handler = functools.partial(Handler, directory=str(root))
    with http.server.ThreadingHTTPServer(("127.0.0.1", a.port), handler) as httpd:
        print(f"serving {root} on http://127.0.0.1:{a.port}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def cmd_status(paths, a) -> int:
    from .context import load_context
    from .questions import latest, open_flags, publishable_revision
    ctx = load_context(paths)
    print(f"source import: {ctx.source['import_id'] if ctx.source else 'none'}")
    counts: dict[str, int] = {}
    for _, q in ctx.all_questions:
        rev = latest(q)
        counts[rev["status"]] = counts.get(rev["status"], 0) + 1
        pub = publishable_revision(q)
        line = f"  {q['id']} r{rev['revision']} {rev['status']:<12} ch{rev.get('chapter')} {rev.get('style'):<11}"
        if pub and pub is not rev:
            line += f" (published r{pub['revision']})"
        if open_flags(rev):
            line += " FLAGGED"
        if a.verbose:
            print(line)
    print("questions by status of latest revision:", counts or "none")
    g = {}
    for t in ctx.glossary.values():
        g[t["status"]] = g.get(t["status"], 0) + 1
    print("glossary:", g)
    print("visual templates:", {k: t["status"] for k, t in ctx.templates.items()})
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python3 -m tools", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("import", help="import digitization exports")
    s.add_argument("--source", required=True, help="the digitization project's output directory")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true", help="re-import even if this exact source was imported")
    s.add_argument("--no-figures", action="store_true", help="do not copy figure crops into private/")
    s.add_argument("-v", "--verbose", action="store_true")
    s.set_defaults(fn=cmd_import)

    s = sub.add_parser("sources", help="list/show imported source chunks (private)")
    s.add_argument("action", choices=["list", "show"])
    s.add_argument("ref", nargs="?", help="chunk uid or id (for show)")
    s.add_argument("--chapter", type=int)
    s.add_argument("--important", action="store_true", help="only '!'-marked chunks")
    s.set_defaults(fn=cmd_sources)

    s = sub.add_parser("new", help="create a manual draft question")
    s.add_argument("--chunk", action="append", required=True, help="source chunk uid/id (repeatable)")
    s.add_argument("--style", default="concept", choices=["recall", "concept", "scenario", "calculation"])
    s.add_argument("--author")
    s.set_defaults(fn=cmd_new)

    s = sub.add_parser("generate", help="generate draft candidates with the configured LLM provider")
    s.add_argument("--chunk", action="append", help="source chunk uid/id (repeatable)")
    s.add_argument("--question", help="regenerate: add a new draft revision to this question")
    s.add_argument("--count", type=int)
    s.add_argument("--instruction", help="extra instruction for the generator")
    s.set_defaults(fn=cmd_generate)

    s = sub.add_parser("verify", help="run automated checks")
    s.add_argument("ids", nargs="*")
    s.add_argument("--strict", action="store_true", help="exit 1 if any question fails")
    s.set_defaults(fn=cmd_verify)

    s = sub.add_parser("review", help="human review actions")
    s.add_argument("action", choices=["show", "approve", "reject", "request-changes", "reopen", "retire", "edit",
                                      "new-revision", "resolve-flag"])
    s.add_argument("id")
    s.add_argument("--revision", type=int)
    s.add_argument("--reviewer")
    s.add_argument("--note")
    s.add_argument("--ack", help="comma-separated hazards you have checked: ocr,pages,figures")
    s.add_argument("--checklist", choices=["all"], help="confirm the whole checklist non-interactively")
    s.add_argument("--no-source", action="store_true")
    s.add_argument("--demote", action="store_true", help="resolve-flag: send an approved revision back to review")
    s.set_defaults(fn=cmd_review)

    s = sub.add_parser("glossary", help="glossary: list/check/approve/suggest/autolink")
    s.add_argument("action", choices=["list", "check", "approve", "suggest", "autolink"])
    s.add_argument("--apply", action="store_true", help="autolink: write the changes (new draft revisions)")
    s.add_argument("ids", nargs="*")
    s.add_argument("--reviewer")
    s.add_argument("--note")
    s.set_defaults(fn=cmd_glossary)

    s = sub.add_parser("visuals", help="visual templates: list/approve")
    s.add_argument("action", choices=["list", "approve"])
    s.add_argument("key", nargs="?", help="template@version")
    s.add_argument("--reviewer")
    s.add_argument("--note")
    s.add_argument("--checklist", choices=["all"])
    s.set_defaults(fn=cmd_visuals)

    s = sub.add_parser("chapters", help="chapter/section headings: list/verify")
    s.add_argument("action", choices=["list", "verify-section", "verify-chapter"])
    s.add_argument("target", nargs="?")
    s.add_argument("--title")
    s.add_argument("--reviewer")
    s.set_defaults(fn=cmd_chapters)

    s = sub.add_parser("preview", help="build a PRIVATE preview including drafts")
    s.set_defaults(fn=cmd_preview)

    s = sub.add_parser("publish", help="build dist/ from approved content")
    s.add_argument("--skip-flagged", action="store_true")
    s.add_argument("--without-source", action="store_true",
                   help="publish without the private import (source/copy checks skipped)")
    s.set_defaults(fn=cmd_publish)

    s = sub.add_parser("deploy", help="push dist/ to a static-hosting git branch (e.g. GitHub Pages)")
    s.add_argument("--remote", required=True, help="git remote URL of the site repository")
    s.add_argument("--branch", default="gh-pages")
    s.add_argument("--dry-run", action="store_true", help="show what would change, push nothing")
    s.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    s.set_defaults(fn=cmd_deploy)

    s = sub.add_parser("release-check", help="scan a build for private material")
    s.add_argument("dir", nargs="?")
    s.add_argument("--mode", default="production", choices=["production", "preview"])
    s.set_defaults(fn=cmd_release_check)

    s = sub.add_parser("serve", help="serve the build on localhost")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--preview", action="store_true")
    s.set_defaults(fn=cmd_serve)

    s = sub.add_parser("status", help="overview")
    s.add_argument("-v", "--verbose", action="store_true")
    s.set_defaults(fn=cmd_status)

    a = p.parse_args(argv)
    try:
        return a.fn(paths_from_env(), a)
    except ToolError as exc:
        eprint(f"error: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
