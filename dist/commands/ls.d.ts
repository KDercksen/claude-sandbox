import { Command } from '@oclif/core';
export default class Ls extends Command {
    static description: string;
    run(): Promise<void>;
}
