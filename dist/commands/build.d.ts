import { Command } from '@oclif/core';
export default class Build extends Command {
    static description: string;
    static flags: {
        tag: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
    };
    run(): Promise<void>;
}
