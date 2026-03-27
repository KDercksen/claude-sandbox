export interface ContainerInfo {
    created: string;
    name: string;
    repo: string;
    sshPort: number;
    status: string;
}
export interface CreateContainerOpts {
    branch?: string;
    claudeConfigDir: string;
    claudeConfigFile: string;
    createPr: boolean;
    githubToken: string;
    image: string;
    name: string;
    prompt: string;
    repo: string;
    sshPort: number;
    sshPublicKeyPath: string;
}
export declare class SandboxDocker {
    private docker;
    constructor();
    buildImage(dockerDir: string, tag: string): Promise<void>;
    createAndStartContainer(opts: CreateContainerOpts): Promise<ContainerInfo>;
    execInContainer(name: string, cmd: string[]): Promise<string>;
    findFreePort(min: number, max: number): Promise<number>;
    listContainers(): Promise<ContainerInfo[]>;
    removeContainer(name: string): Promise<void>;
    stopContainer(name: string): Promise<void>;
    private isPortFree;
}
