"""Scan every tracked SKILL.md bundle; never execute the scanned skills."""
import json
import os
from pathlib import Path
import subprocess
import sys

def main():
    root = Path.cwd().resolve()
    out = Path(os.environ.get("SKILL_REPORT_DIR", "skillscan-reports"))
    out.mkdir(parents=True, exist_ok=True)
    tracked = subprocess.check_output(["git", "ls-files", "-z"]).decode("utf-8").split("\0")
    skills = sorted(p for p in tracked if p and Path(p).name == "SKILL.md")
    results = []
    for number, name in enumerate(skills, 1):
        target = root / name
        report = out / f"{number:03d}.json"
        log = out / f"{number:03d}.log"
        # Reject symlinks instead of scanning files outside the checkout.
        if any(p.is_symlink() for p in [target, *target.parents] if p != root):
            results.append({"skill": name, "exit_code": 2, "error": "symlink rejected"})
            continue
        try:
            with log.open("w", encoding="utf-8") as stream:
                run = subprocess.run(
                    ["skillspector", "scan", str(target.parent), "--no-llm",
                     "--fail-on-findings", "--fail-on-incomplete",
                     "--format", "json", "--output", str(report.resolve())],
                    stdout=stream, stderr=subprocess.STDOUT, timeout=180,
                    check=False,
                )
            code = run.returncode
            # A successful process without a readable report is not a pass.
            if code == 0:
                with report.open(encoding="utf-8") as stream:
                    json.load(stream)
            results.append({"skill": name, "exit_code": code, "report": report.name})
        except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
            results.append({"skill": name, "exit_code": 2, "error": str(exc)})
    failed = any(item["exit_code"] != 0 for item in results)
    status = "FAILED" if failed else ("PASSED" if skills else "NO_SKILLS")
    index = {"status": status, "skills_count": len(skills), "results": results}
    (out / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    summary = f"SkillSpector: {status}. Tracked skill bundles: {len(skills)}.\n"
    if not skills:
        summary += "No tracked SKILL.md files found; no skills were scanned.\n"
    summary += "Static scan only; no LLM analysis. See report artifact for findings and coverage.\n"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(summary)
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
