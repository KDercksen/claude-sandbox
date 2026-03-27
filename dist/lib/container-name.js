import { randomBytes } from 'node:crypto';
const PREFIX = 'claude-sandbox';
function sanitize(input) {
    return input
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, '-')
        .replaceAll(/-+/g, '-')
        .replaceAll(/^-|-$/g, '');
}
export function generateContainerName(repo, name) {
    if (name) {
        return `${PREFIX}-${sanitize(name)}`;
    }
    const repoName = repo.split('/').pop() ?? 'sandbox';
    const suffix = randomBytes(3).toString('hex');
    return `${PREFIX}-${sanitize(repoName)}-${suffix}`;
}
