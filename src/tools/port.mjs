// port.mjs — Port tool: check if a TCP port is open (dev server health)
import net from "node:net";

export const portTool = {
  schema: {
    name: "Port_Check",
    description: "Check if a TCP port is open on localhost — use to verify dev server is listening (e.g., 3000).",
    parameters: {
      type: "object",
      properties: {
        port: { type: "integer", description: "Port number (e.g., 3000)" },
        host: { type: "string", description: "Host (default 127.0.0.1)" },
        timeout: { type: "integer", description: "Timeout ms (default 2000)" },
      },
      required: ["port"],
    },
  },

  async execute(args) {
    const port = Number(args?.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Port_Check failed: valid port 1-65535 required" };
    const host = args.host || "127.0.0.1";
    const timeout = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 2000;
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (open, error) => {
        if (done) return;
        done = true;
        socket.destroy();
        if (open) resolve({ ok: true, open: true, port, host, hint: `Port ${port} is open ✅` });
        else resolve({ ok: true, open: false, port, host, error: error || "ECONNREFUSED", hint: `Port ${port} closed — server not listening` });
      };
      socket.setTimeout(timeout);
      socket.once("connect", () => finish(true));
      socket.once("error", (e) => finish(false, e.message));
      socket.once("timeout", () => finish(false, "timeout"));
      socket.connect(port, host);
    });
  },
};
