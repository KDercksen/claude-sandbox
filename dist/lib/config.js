// src/lib/config.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const DEFAULTS = {
    defaultBranchPrefix: 'claude/',
    image: 'claude-sandbox:latest',
    sshPortRange: [2200, 2299],
};
export function getConfigDir() {
    return join(homedir(), '.claude-sandbox');
}
export async function loadConfig(configDir) {
    const dir = configDir ?? getConfigDir();
    const configPath = join(dir, 'config.json');
    try {
        const raw = await readFile(configPath, 'utf8');
        const partial = JSON.parse(raw);
        return { ...DEFAULTS, ...partial };
    }
    catch {
        return { ...DEFAULTS };
    }
}
export async function saveConfig(configDir, config) {
    const dir = configDir ?? getConfigDir();
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}
