/**
 * Who a client is to the broker (2026-10-08): with the broker's development
 * authorization on (`auth.dev` in `broker/security.json`, mcp-broker 1.8.1),
 * every client presents a bearer token, and the token's subject is what the
 * policy grants or denies. Without it, no token is sent and the broker
 * answers everyone, as before.
 *
 * In Node a client says which role it calls as, and its token is read from
 * `BROKER_TOKEN_<ROLE>`: the station's process holds the station's token, the
 * night's agent the agent's. A role whose variable is unset sends no token,
 * which an authorized broker refuses (401): a client never borrows another
 * role's token.
 *
 * In a page there is one token per device, whatever the page: given once in
 * the address (`#token=...`, the link or QR code a tablet is handed), kept in
 * the browser, and taken out of the address bar.
 */

/** The roles of `broker/security.json`. */
export type BrokerRole = "operator" | "station" | "agent" | "factory" | "monitor";

const STORAGE_KEY = "broker.token";

/** The device's token in a page: from `#token=` once, then from the browser's storage. */
export function pageToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
        if (match) {
            const token = decodeURIComponent(match[1]);
            window.localStorage.setItem(STORAGE_KEY, token);
            const rest = window.location.hash.replace(/(?:^#|&)token=[^&]+/, "").replace(/^&/, "");
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
            return token;
        }
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/** The headers a client of `role` sends to the broker: its token when there is one, nothing otherwise. */
export function brokerAuth(role: BrokerRole): Record<string, string> {
    const env = typeof process !== "undefined" && process.env ? process.env : undefined;
    const token = env ? env[`BROKER_TOKEN_${role.toUpperCase()}`] : pageToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
