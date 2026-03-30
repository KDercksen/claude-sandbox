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

Use available skills (TDD, debugging, brainstorming, etc.) when they apply.

## Testing

Do not install test frameworks or write tests unless the repo already has a configured test suite. Check for existing test config (package.json test scripts, pytest.ini, Makefile test targets, etc.) before running any tests. If no test suite exists, skip test-related steps in the completion checklist.

## Completion checklist

Do NOT consider yourself done until ALL of these pass:
- [ ] All existing tests pass (if test suite exists)
- [ ] New tests written for new/changed behavior (if test suite exists)
- [ ] Code has been self-reviewed (re-read the diff)
- [ ] No linting errors or warnings introduced
- [ ] Commit messages are descriptive
{{COMPLETION_PR_ITEM}}

## Git workflow

- Make small, focused commits as you go — one per logical change. Use descriptive commit messages.
{{GIT_WORKFLOW_SUFFIX}}
