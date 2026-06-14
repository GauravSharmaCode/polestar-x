/**
 * Mirrors AgentSession._isRetryableError() so polestar does not double-dispatch
 * follow-ups while coding-agent auto-retry is handling the same provider fault.
 */
export function isAgentSessionRetryableError(errorMessage: string): boolean {
	const err = errorMessage;
	if (/usage.?limit|quota.?exceeded|insufficient.?quota|billing|payment.?required|exceeded.*limit/i.test(err)) {
		return false;
	}
	return /overloaded|provider.?returned.?error|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|internal.?error|network.?error|connection.?error|connection.?refused|connection.?lost|websocket.?closed|websocket.?error|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|ended without|stream ended before message_stop|http2 request did not get a response|timed? out|timeout|terminated|retry delay/i.test(
		err,
	);
}
