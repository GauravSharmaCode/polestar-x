export type BudgetType = "recurring" | "limited";

// Recurring: subscription resets monthly — prefer to avoid exhausting limited budgets.
// Limited: monthly token cap (GitHub Copilot, Cursor) — use as reserve.
export const PROVIDER_BUDGET: Record<string, BudgetType> = {
	anthropic: "recurring",
	antigravity: "recurring",
	openrouter: "recurring",
	github: "limited",
	cursor: "limited",
	copilot: "limited",
};

export function getProviderBudget(provider: string): BudgetType {
	return PROVIDER_BUDGET[provider.toLowerCase()] ?? "limited";
}
