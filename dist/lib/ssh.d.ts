export interface SSHKeyPair {
    privateKeyPath: string;
    publicKeyPath: string;
}
export declare function ensureSSHKeyPair(configDir: string): Promise<SSHKeyPair>;
