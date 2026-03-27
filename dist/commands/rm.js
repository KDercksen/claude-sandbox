// src/commands/rm.ts
import { Args, Command, Flags } from '@oclif/core';
import { SandboxDocker } from '../lib/docker.js';
export default class Rm extends Command {
    static args = {
        name: Args.string({ description: 'Container name', required: true }),
    };
    static description = 'Remove a sandbox container';
    static flags = {
        force: Flags.boolean({
            char: 'f',
            default: false,
            description: 'Force removal of running container',
        }),
    };
    async run() {
        const { args, flags } = await this.parse(Rm);
        const docker = new SandboxDocker();
        if (!flags.force) {
            const containers = await docker.listContainers();
            const container = containers.find((c) => c.name === args.name);
            if (container?.status === 'running') {
                this.error(`Container "${args.name}" is still running. Use --force or stop it first.`);
            }
        }
        this.log(`Removing ${args.name}...`);
        await docker.removeContainer(args.name);
        this.log(`Container ${args.name} removed.`);
    }
}
