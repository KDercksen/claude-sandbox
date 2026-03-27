import { Command } from '@oclif/core';
export default class Attach extends Command {
    static args: {
        name: import("@oclif/core/interfaces").Arg<string, Record<string, unknown>>;
    };
    static description: string;
    run(): Promise<void>;
}
