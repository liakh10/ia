export type EventName = "ConfigSet" | "AgentSet" | "RoundOpened" | "Planted" | "HarnessCommitted" | "DocketOpened" | "RunStarted" | "Acted" | "DocketSettled" | "RoundSettled" | "BountyClaimed" | "SuretyMoved" | "Drawn" | "FeesWithdrawn" | (string & {});
export interface IaEvent {
    name: EventName;
    data: Record<string, any>;
    /** where it came from (filled by the indexer) */
    signature?: string;
    slot?: number;
    blockTime?: number | null;
    /** position of the event inside its transaction */
    n?: number;
}
/** Decode one `Program data:` payload, or null when it is not an `ia` event. */
export declare function decodeEvent(b64: string): IaEvent | null;
/**
 * The `ia` events in one transaction's log lines, in order. Tracks the invoke stack: a `Program data:` line counts only while the top
 * of the stack is `programId`.
 */
export declare function parseEvents(logs: string[], programId?: string): IaEvent[];
