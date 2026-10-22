# Good first issues

1. **Light theme for the app shell.** `apps/web/app/globals.css` defines only dark tokens; add a
   light set under `prefers-color-scheme` and a toggle. Acceptance: Playwright screenshot in both.
2. **Persist the canvas viewport without an edit.** Pan/zoom is saved only with the next edit
   (`ArchCanvas.tsx → withViewport`). Add a debounced, non-undoable viewport save.
3. **Export the ER diagram as PNG** from the Database workspace using the same approach as the
   architecture canvas (`html-to-image`).
4. **Validation rule:** warn when an endpoint with `paginated: true` has `response_is_list: false`
   (`validation/rules.py` + a test in `tests/test_validation.py`).
5. **Password change endpoint** (`routes/auth.py`) with argon2 re-hash and a pytest case.
