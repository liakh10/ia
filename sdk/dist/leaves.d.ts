export declare const LEAF_KINDS: {
    readonly 1: "manifest";
    readonly 2: "transcript";
    readonly 3: "harness";
    readonly 4: "verdict";
    readonly 5: "reveal";
    readonly 6: "forecast";
    readonly 7: "redaction";
};
export declare function decodeLeaf(b: Uint8Array): Record<string, any> & {
    kind: string;
};
