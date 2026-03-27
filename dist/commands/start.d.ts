import { Command } from '@oclif/core';
export default class Start extends Command {
    static description: string;
    static flags: {
        branch: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
        'create-pr': import("@oclif/core/interfaces").BooleanFlag<boolean>;
        issue: import("@oclif/core/interfaces").OptionFlag<number | undefined, import("@oclif/core/interfaces").CustomOptions>;
        name: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
        pr: import("@oclif/core/interfaces").OptionFlag<number | undefined, import("@oclif/core/interfaces").CustomOptions>;
        prompt: import("@oclif/core/interfaces").OptionFlag<string | undefined, import("@oclif/core/interfaces").CustomOptions>;
        repo: import("@oclif/core/interfaces").OptionFlag<string, import("@oclif/core/interfaces").CustomOptions>;
    };
    run(): Promise<void>;
    private resolveGitHubToken;
}
