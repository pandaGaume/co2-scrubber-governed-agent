/** Console presentation only. Full calls remain in the execution trace. */
export function toolLogLine(slot: string, tool: string, args: Record<string, any>): string {
    const payload = JSON.stringify(args);
    if (slot === "reasoner" && tool === "decide") return `[${slot}] ${tool} ${JSON.stringify({ conversationId: args.conversationId, decisionId: args.decisionId, promptFile: args.prompt, payloadCharacters: payload.length })}`;
    return `[${slot}] ${tool} ${payload.length <= 1000 ? payload : `${payload.slice(0, 1000)} [console excerpt; ${payload.length} characters total]`}`;
}
