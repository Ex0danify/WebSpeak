# Legacy smoke scripts (reference only)

These 37 scripts are what remains of the G-SMOKE run of 2026-09-26, the manual
smoke check of the design-v2 redesign. They are kept because they record real
selectors, message names and timings.

**They are not tests.** Do not run, lint or format them, and do not import
from them. Several depend on a local TeamSpeak server, a persistent browser
profile, and absolute paths on the original machine (`/home/ex0/...`).

Each script is ported into the test suite by the step named in
`docs/testing/testsuite-plan.md` (section 5, "Reuse map"). Known traps when
reading them:

- Selectors are class based and went stale; the suite uses roles and labels.
- The persistent-profile identity approach does not work (finding F1).
- Fixed waits (`waitForTimeout`) are timing guesses; the suite polls for state.

This directory is deleted by step 8.4.
