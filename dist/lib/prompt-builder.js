import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
async function defaultExec(cmd, args) {
    const { stdout } = await execFileAsync(cmd, args);
    return stdout;
}
async function fetchIssue(repo, issue, exec) {
    const raw = await exec('gh', ['issue', 'view', String(issue), '--repo', repo, '--json', 'title,body']);
    return JSON.parse(raw);
}
async function fetchPR(repo, pr, exec) {
    const raw = await exec('gh', ['pr', 'view', String(pr), '--repo', repo, '--json', 'title,body']);
    return JSON.parse(raw);
}
export async function buildPrompt(source, exec = defaultExec, options = {}) {
    const parts = [];
    if (source.prompt) {
        parts.push(source.prompt);
    }
    if (source.issue) {
        const data = await fetchIssue(source.repo, source.issue, exec);
        parts.push(`\n---\nGitHub Issue #${source.issue}:\n\n# ${data.title}\n\n${data.body}`);
    }
    if (source.pr) {
        const data = await fetchPR(source.repo, source.pr, exec);
        parts.push(`\n---\nGitHub PR #${source.pr}:\n\n# ${data.title}\n\n${data.body}`);
    }
    if (parts.length === 0) {
        throw new Error('Prompt required: provide at least one of --prompt, --issue, or --pr');
    }
    // If only issue/PR and no explicit prompt, add a default instruction
    if (!source.prompt && parts.length > 0) {
        parts.unshift('Resolve the following. Make the necessary code changes, ensure tests pass, and commit your work.');
    }
    parts.push(gitWorkflowInstructions(options.createPr ?? false));
    return parts.join('\n');
}
function gitWorkflowInstructions(createPr) {
    const lines = [
        '',
        '---',
        '## Git workflow',
        '',
        '- Make small, focused commits as you go — one per logical change. Use descriptive commit messages.',
    ];
    if (createPr) {
        lines.push('- When you are done, push your branch and create a PR with a clear title and description summarizing what changed and why.');
    }
    else {
        lines.push('- When you are done, commit your work. The branch will be pushed automatically.');
    }
    return lines.join('\n');
}
