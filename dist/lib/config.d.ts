export interface SandboxConfig {
    defaultBranchPrefix: string;
    githubPat?: string;
    image: string;
    sshPortRange: [number, number];
}
export declare function getConfigDir(): string;
export declare function loadConfig(configDir?: string): Promise<SandboxConfig>;
export declare function saveConfig(configDir: string | undefined, config: SandboxConfig): Promise<void>;
