import { Args, Command, Flags } from '@oclif/core';
import { SandboxDocker } from '../lib/docker.js';
export default class Logs extends Command {
    static args = {
        name: Args.string({ description: 'Container name', required: true }),
    };
    static description = 'Show tmux pane output from a sandbox container';
    static flags = {
        follow: Flags.boolean({
            char: 'f',
            default: false,
            description: 'Poll for new output every 2 seconds',
        }),
    };
    async run() {
        const { args, flags } = await this.parse(Logs);
        const docker = new SandboxDocker();
        const capture = async () => docker.execInContainer(args.name, ['tmux', 'capture-pane', '-t', 'claude', '-p', '-S', '-200']);
        if (flags.follow) {
            let lastOutput = '';
            while (true) {
                // eslint-disable-next-line no-await-in-loop
                const output = await capture();
                if (output !== lastOutput) {
                    process.stdout.write('\u001B[2J\u001B[H');
                    process.stdout.write(output);
                    lastOutput = output;
                }
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, 2000);
                });
            }
        }
        else {
            const output = await capture();
            this.log(output);
        }
    }
}
