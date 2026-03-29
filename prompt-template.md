## How to work

Follow this loop for every task. Do NOT stop after implementing — steps 4-6 are mandatory.

1. **Understand:** Read the issue/PR, explore relevant code paths, understand the context
2. **Plan:** Decide on your approach before writing code. Use brainstorming/planning skills if available
3. **Implement:** Make changes in small, focused commits — one per logical change
4. **Verify:** Run tests, linting, type checks. Fix any failures before proceeding
5. **Review:** Re-read your own diff critically. Would this pass code review? Look for:
   - Hardcoded values, missing edge cases, unclear naming
   - Security issues (injection, XSS, secrets in code)
   - Missing tests for new/changed behavior
6. **Iterate:** If anything is off, go back to step 3. Repeat until clean

Use available skills (TDD, debugging, brainstorming, etc.) when they apply — and report which ones you're using in your progress updates.

## Completion checklist

Do NOT consider yourself done until ALL of these pass:
- [ ] All existing tests pass
- [ ] New tests written for new/changed behavior
- [ ] Code has been self-reviewed (re-read the diff)
- [ ] No linting errors or warnings introduced
- [ ] Commit messages are descriptive
{{COMPLETION_PR_ITEM}}

## Git workflow

- Make small, focused commits as you go — one per logical change. Use descriptive commit messages.
{{GIT_WORKFLOW_SUFFIX}}

## Progress updates

As you work, append progress lines to /workspace/.claude-progress using these markers:

@@PHASE("name") — emit when you transition to a new phase of work. Required phases:
  exploring codebase, planning, implementing, verifying, reviewing, iterating, creating pr

@@UPDATE("detail") — emit after each significant action. Be specific about:
  - Which skill or approach you are using: @@UPDATE("Invoking TDD skill — writing tests first")
  - Loop iterations: @@UPDATE("Iteration 2: fixing 3 failing tests from previous implementation")
  - Verification results: @@UPDATE("Verification: 12/12 tests pass, no lint errors")
  - Self-review findings: @@UPDATE("Self-review: found hardcoded value in config, fixing")
  - Subagent activity: @@UPDATE("Spawned 3 subagents for parallel implementation")

@@ARTIFACT("type: description") — emit when you produce a concrete output.
  Types: commit, pr, file, test. Examples:
    @@ARTIFACT("commit: Add failing tests for user authentication")
    @@ARTIFACT("pr: https://github.com/org/repo/pull/42")
    @@ARTIFACT("test: 8 passing, 0 failing")

Before finishing, emit a final verification summary:
  @@PHASE("verification")
  @@UPDATE("Final checklist: tests=PASS|FAIL, lint=PASS|FAIL, self-review=PASS|FAIL")

If any check fails, loop back and fix it. Do not finish with failures.

Start with @@PHASE("exploring codebase") as your first line. Update phases as your work evolves.
