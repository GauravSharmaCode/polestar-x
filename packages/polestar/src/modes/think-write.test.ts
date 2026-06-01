import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExecutionMode, POLESTAR_DEFAULT_TOOLS, setExecutionMode } from "./think-write.ts";

describe("Think and Write Modes Controller", () => {
	let activeTools: string[] = [];
	let mockPi: any;
	let mockCtx: any;

	beforeEach(() => {
		activeTools = [...POLESTAR_DEFAULT_TOOLS];
		mockPi = {
			getActiveTools: () => activeTools,
			setActiveTools: (tools: string[]) => {
				activeTools = tools;
			},
		};
		mockCtx = {
			ui: {
				setStatus: vi.fn(),
				notify: vi.fn(),
			},
		};
	});

	it("should initialize in Write mode", () => {
		expect(getExecutionMode()).toBe("write");
	});

	it("should filter out mutating tools when transitioning to Think mode", () => {
		setExecutionMode(mockPi, "think", mockCtx);
		expect(getExecutionMode()).toBe("think");

		// Mutating tools should be filtered out
		expect(activeTools).not.toContain("edit");
		expect(activeTools).not.toContain("write");
		expect(activeTools).not.toContain("apply_patch");
		expect(activeTools).not.toContain("todowrite");
		expect(activeTools).not.toContain("bash");

		// Read-only tools should remain
		expect(activeTools).toContain("read");
		expect(activeTools).toContain("grep");
		expect(activeTools).toContain("glob");

		// plan_exit should be added
		expect(activeTools).toContain("plan_exit");

		// Status line indicator should be updated
		expect(mockCtx.ui.setStatus).toHaveBeenCalledWith("mode", "⏸ think");
	});

	it("should restore full default tools when transitioning to Write mode", () => {
		// First transition to think
		setExecutionMode(mockPi, "think", mockCtx);
		expect(activeTools).not.toContain("edit");

		// Transition back to write
		setExecutionMode(mockPi, "write", mockCtx);
		expect(getExecutionMode()).toBe("write");

		// All tools should be restored
		expect(activeTools).toContain("edit");
		expect(activeTools).toContain("write");
		expect(activeTools).toContain("apply_patch");
		expect(activeTools).not.toContain("plan_exit");

		// Status line indicator should be updated
		expect(mockCtx.ui.setStatus).toHaveBeenCalledWith("mode", "✎ write");
	});
});
