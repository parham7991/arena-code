// hooks.mjs — central event/hook bus for Arena Code (M4+).
// Plugins, skills and internal modules can subscribe to lifecycle events and
// optionally transform data (onToolBefore, onBridgeBefore, etc.).
//
//   hookBus.on(event, handler, { priority })
//   hookBus.off(event, handlerId)
//   await hookBus.emit(event, data)   // runs handlers in priority order

export const EVENTS = [
  "onSessionStart",
  "onSessionEnd",
  "onTurnStart",
  "onTurnEnd",
  "onToolBefore",
  "onToolAfter",
  "onBridgeBefore",
  "onBridgeAfter",
  "onMessageAdd",
  "onContextPrune",
  "onContextCompact",
  "onError",
  "onSkillStart",
  "onSkillEnd",
  "onPluginLoad",
  "onSlashCommand",
  "onExternalChange",
];

let idCounter = 0;

export const hookBus = {
  _handlers: new Map(), // event -> [{id, fn, priority}]

  on(event, handler, options = {}) {
    if (!EVENTS.includes(event)) {
      throw new Error(`Unknown hook event: ${event}`);
    }
    if (typeof handler !== "function") {
      throw new Error(`Hook handler for '${event}' must be a function`);
    }
    const id = `h_${idCounter++}`;
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push({ id, fn: handler, priority: options.priority ?? 100 });
    return id;
  },

  off(event, handlerId) {
    const list = this._handlers.get(event);
    if (!list) return false;
    const idx = list.findIndex((h) => h.id === handlerId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  },

  /** Remove all handlers (mostly for tests / hot reload). */
  clear(event) {
    if (event) this._handlers.delete(event);
    else this._handlers.clear();
  },

  handlers(event) {
    return [...(this._handlers.get(event) || [])].sort((a, b) => a.priority - b.priority);
  },

  /**
   * Emit an event. Each handler may return a value; for "Before" events the
   * handler may mutate `data` to transform the request. Returns the final data.
   * Handlers run sequentially in priority order.
   */
  async emit(event, data = {}) {
    const handlers = this.handlers(event);
    for (const h of handlers) {
      const result = await h.fn(data);
      // If a handler returns a value, treat it as the new data (transform).
      if (result !== undefined) data = result;
    }
    return data;
  },

  /** Emit a fire-and-forget event (no return used). */
  async notify(event, data = {}) {
    await this.emit(event, data);
  },
};

/** Reset the global bus (useful in tests). */
export function resetHooks() {
  hookBus.clear();
}
