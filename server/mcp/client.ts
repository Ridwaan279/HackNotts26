import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: { type: "object"; [key: string]: unknown };
}
export interface MemoryTools {
  definitions: ToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export async function connectMemoryTools(dbPath: string): Promise<MemoryTools> {
  const sourceMode = import.meta.url.endsWith(".ts");
  const entry = fileURLToPath(
    new URL(sourceMode ? "./server.ts" : "./server.js", import.meta.url),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: sourceMode ? ["--import", "tsx", entry] : [entry],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (pair): pair is [string, string] => pair[1] !== undefined,
        ),
      ),
      DB_PATH: dbPath,
    },
    stderr: "inherit",
  });
  const client = new Client({ name: "wrist-pet-host", version: "0.1.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return {
      definitions: tools,
      async callTool(name, args) {
        if (!tools.some((tool) => tool.name === name))
          throw new Error(`Tool ${name} is not available.`);
        const result = CallToolResultSchema.parse(
          await client.callTool({ name, arguments: args }, undefined, {
            timeout: 10000,
          }),
        );
        const text = result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        if (result.isError) throw new Error(text || "The MCP tool failed.");
        if (!text) throw new Error("The MCP tool returned no JSON result.");
        return JSON.parse(text) as unknown;
      },
      async close() {
        await client.close();
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
