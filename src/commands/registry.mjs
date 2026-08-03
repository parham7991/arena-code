// commands/registry.mjs — slash-command registry and matching.
export class CommandRegistry {
  constructor() {
    this.commands = new Map(); // name -> {name, description, handler, source}
  }

  register(cmd) {
    if (!cmd?.name) return false;
    this.commands.set(cmd.name, { name: cmd.name, description: cmd.description || "", handler: cmd.handler, source: cmd.source || "builtin" });
    return true;
  }

  get(name) {
    return this.commands.get(name.replace(/^\//, ""));
  }

  all() {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Split "/cmd arg1 arg2" into { name, args }. */
  parse(input) {
    const text = String(input || "").trim();
    if (!text.startsWith("/")) return null;
    const [name, ...rest] = text.slice(1).split(/\s+/);
    return { name, args: rest.filter(Boolean) };
  }

  async run(input, context) {
    const parsed = this.parse(input);
    if (!parsed) return null;
    const cmd = this.commands.get(parsed.name);
    if (!cmd) return { error: `Unknown command: /${parsed.name}` };
    return cmd.handler(parsed.args, context);
  }
}
