export const PROTOCOL_VERSION = 1;
const MAX_LINE = 65536;

/** Bound framing independently of socket chunks, and reject incompatible peers. */
export function readMessages(socket, receive, fail) {
  let pending = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => {
    pending += chunk;
    if (pending.length > MAX_LINE && !pending.includes("\n")) return fail(new Error("Control frame too large."));
    let newline;
    while ((newline = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line.length > MAX_LINE) return fail(new Error("Control frame too large."));
      try {
        const message = JSON.parse(line);
        if (message?.version !== PROTOCOL_VERSION || typeof message.type !== "string") throw new Error("Invalid control message.");
        receive(message);
      } catch (error) { fail(error); return; }
    }
  });
}

export function sendMessage(socket, message) {
  if (!socket.destroyed) socket.write(JSON.stringify({ version: PROTOCOL_VERSION, ...message }) + "\n");
}
