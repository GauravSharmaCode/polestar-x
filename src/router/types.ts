import type { Model } from "@earendil-works/pi-ai";

export type TaskClass = "architecture" | "code_edit" | "exploration" | "background" | "privacy_local";

export interface RouteRequest {
	prompt: string;
	currentModel?: Model<any>;
	availableModels: Model<any>[];
	preferLocal?: boolean;
}

export interface RouteResult {
	taskClass: TaskClass;
	model?: Model<any>;
	reason: string;
}
