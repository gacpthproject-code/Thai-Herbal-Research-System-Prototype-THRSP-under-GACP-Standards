"""Reduce a raw jest log to suites, test names, failures and totals.

Raw logs carry console output from the code under test (dedupe hashes,
tokens) that secret scanners flag; the summary keeps only jest's own lines.
usage: python3 -I summarize-jest-log.py <raw.txt> <out.txt>
"""
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")
SUITE = re.compile(r"^(PASS|FAIL) (\S+)")
CASE = re.compile(r"^\s+([✓✕○])\s+(.*?)(?:\s+\(\d+ m?s\))?$")
FAILURE = re.compile(r"^  ● (.*)$")
DIFF = re.compile(r"^\s+((Expected|Received)(?: [a-z ]+)?:\s|Cannot find module )")
TOTALS = re.compile(r"^(Test Suites|Tests|Snapshots):\s")

raw_path, out_path = sys.argv[1], sys.argv[2]
out = [f"summary of {raw_path.rsplit('/', 1)[-1]} (raw log removed; jest lines only)", ""]
diff_budget = 0
with open(raw_path, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line = ANSI.sub("", line.rstrip("\n"))
        if m := SUITE.match(line):
            out.append(f"{m[1]} {m[2]}")
        elif m := CASE.match(line):
            out.append(f"  {m[1]} {m[2]}")
        elif m := FAILURE.match(line):
            out.append(f"FAILED: {m[1]}")
            diff_budget = 4
        elif diff_budget and DIFF.match(line):
            out.append("    " + line.strip())
            diff_budget -= 1
        elif TOTALS.match(line):
            out.append(line)
with open(out_path, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
