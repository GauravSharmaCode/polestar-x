import { type ChildProcess, spawn } from "node:child_process";
import { createInterface, type ReadLine } from "node:readline";

export interface McpTool {
	name: string;
	description: string;
	inputSchema: any;
}

export class McpClient {
	private child: ChildProcess | null = null;
	private rl: ReadLine | null = null;
	private nextId = 1;
	private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

	public isConnected(): boolean {
		return this.child !== null && !this.child.killed;
	}

	public readonly serverName: string;
	private readonly command: string;
	private readonly args: string[];
	private readonly env: Record<string, string>;

	constructor(serverName: string, command: string, args: string[], env: Record<string, string> = {}) {
		this.serverName = serverName;
		this.command = command;
		this.args = args;
		this.env = env;
	}

	async start(): Promise<McpTool[]> {
		return new Promise((resolve, reject) => {
			try {
				const spawnEnv = { ...process.env };
				for (const [k, v] of Object.entries(this.env)) {
					// Support environment variable expansion (e.g. $GITHUB_TOKEN or %PATH%)
					if (v.startsWith("$")) {
						const envKey = v.slice(1);
						spawnEnv[k] = process.env[envKey] || "";
					} else {
						spawnEnv[k] = v;
					}
				}

				this.child = spawn(this.command, this.args, {
					env: spawnEnv,
					stdio: ["pipe", "pipe", "ignore"],
					shell: process.platform === "win32",
				});

				this.child.on("error", (err) => {
					reject(new Error(`Failed to start MCP server ${this.serverName}: ${err.message}`));
				});

				this.rl = createInterface({ input: this.child.stdout! });
				this.rl.on("line", (line) => {
					try {
						const msg = JSON.parse(line);
						if (msg.id !== undefined) {
							const pending = this.pendingRequests.get(msg.id);
							if (pending) {
								this.pendingRequests.delete(msg.id);
								if (msg.error) {
									pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
								} else {
									pending.resolve(msg.result);
								}
							}
						}
					} catch {
						// Ignore unparseable lines
					}
				});

				// Start handshake
				this.handshake()
					.then((tools) => resolve(tools))
					.catch(reject);
			} catch (err: any) {
				reject(err);
			}
		});
	}

	private async sendRequest(method: string, params: any): Promise<any> {
		const id = this.nextId++;
		const request = {
			jsonrpc: "2.0",
			id,
			method,
			params,
		};

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			if (!this.child || !this.child.stdin || this.child.killed) {
				reject(new Error(`MCP server ${this.serverName} is not running.`));
				return;
			}
			this.child.stdin.write(`${JSON.stringify(request)}\n`);
		});
	}

	private async sendNotification(method: string, params?: any) {
		const notification = {
			jsonrpc: "2.0",
			method,
			params,
		};
		if (this.child?.stdin && !this.child.killed) {
			this.child.stdin.write(`${JSON.stringify(notification)}\n`);
		}
	}

	private async handshake(): Promise<McpTool[]> {
		const _initResult = await this.sendRequest("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "polestar-x", version: "0.1.0" },
		});

		await this.sendNotification("notifications/initialized");

		const toolsResult = await this.sendRequest("tools/list", {});
		return toolsResult.tools || [];
	}

	async callTool(name: string, args: any): Promise<any> {
		const callResult = await this.sendRequest("tools/call", {
			name,
			arguments: args,
		});
		return callResult;
	}

	stop() {
		if (this.rl) {
			this.rl.close();
			this.rl = null;
		}
		if (this.child) {
			if (!this.child.killed) {
				this.child.kill();
			}
			this.child = null;
		}
		this.pendingRequests.clear();
	}
}
