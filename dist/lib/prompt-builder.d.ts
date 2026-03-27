export interface PromptSource {
    issue?: number;
    pr?: number;
    prompt?: string;
    repo: string;
}
type ExecFn = (cmd: string, args: string[]) => Promise<string>;
export interface PromptOptions {
    createPr?: boolean;
}
export declare function buildPrompt(source: PromptSource, exec?: ExecFn, options?: PromptOptions): Promise<string>;
export {};
