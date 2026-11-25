import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TaskRegistry, describeRequest, observeRequest } from "./tasks.mjs";
import { readMessages, sendMessage } from "./protocol.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(webRoot);
const projectRoot = process.env.FILEDESK_ROOT;
if (!projectRoot || !path.isAbsolute(projectRoot)) throw new Error("FILEDESK_ROOT must be an absolute project directory.");
const port = Number(process.env.PORT ?? 13453);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const pipe = process.env.FILEDESK_PIPE;
const token = process.env.FILEDESK_TOKEN;
const tasks = new TaskRegistry();
globalThis[Symbol.for("FileDesk.activity")] = { current: () => tasks.current() };
const sockets = new Set();
let control;
let timer;
let app;
let state = "starting";
let stopping;

function publish(message) { if (control) sendMessage(control, message); }

const server = http.createServer((request, response) => {
  if (tasks.stopping) {
    response.writeHead(503, { "Connection": "close", "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "STOPPING", message: "The service is stopping." }));
    return;
  }
  const task = tasks.begin(...describeRequest(request));
  observeRequest(request, response, task);
  let handlerDone = false;
  let responseDone = false;
  const finish = () => {
    // Next can retain a drain/finish promise after a disconnected response.
    // Stream tasks finish once their response and owned sources are closed.
    if (responseDone && (handlerDone || (task.streaming && task.pendingSources === 0))) tasks.finish(task);
  };
  task.onSettled = finish;
  response.once("close", () => {
    responseDone = true;
    if (!response.writableFinished) task.controller.abort();
    finish();
  });
  response.once("finish", () => { responseDone = true; finish(); });
  tasks.run(task, async () => {
    try { await app.getRequestHandler()(request, response); }
    catch (error) {
      console.error("Request failed.", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    } finally { handlerDone = true; finish(); }
  });
});
server.on("connection", socket => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});

async function stop(force) {
  if (stopping) return stopping;
  if (!tasks.requestExit(force)) {
    publish({ type: "busy", tasks: tasks.snapshot() });
    return;
  }
  state = "stopping";
  publish({ type: "state", state, tasks: tasks.snapshot() });
  stopping = (async () => {
    const deadline = setTimeout(() => { console.error("Forced shutdown after the cleanup deadline."); process.exit(2); }, 9500);
    const closed = server.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
    // Closing sockets propagates cancellation into Next request signals. Explicit
    // task signals also reach storage operations that are not reading a socket.
    if (force) for (const socket of sockets) socket.destroy();
    await closed;
    while (tasks.snapshot().length) await new Promise(resolve => setTimeout(resolve, 20));
    await app?.close();
    clearTimeout(timer);
    clearTimeout(deadline);
    publish({ type: "state", state: "stopped", tasks: [] });
    control?.end();
    process.exit(0);
  })();
  return stopping;
}

async function start() {
  if (pipe) {
    if (!token) throw new Error("A desktop control token is required.");
    control = net.connect(pipe);
    control.on("error", error => { console.error("Desktop control failed.", error); void stop(true); });
    await new Promise((resolve, reject) => { control.once("connect", resolve); control.once("error", reject); });
    let acceptWelcome;
    const welcomed = new Promise(resolve => { acceptWelcome = resolve; });
    const handshakeDeadline = setTimeout(() => { control.destroy(new Error("Desktop handshake timed out.")); }, 10000);
    publish({ type: "hello", token });
    readMessages(control, message => {
      if (message.type === "welcome") { clearTimeout(handshakeDeadline); acceptWelcome(); }
      if (message.type === "exit") void stop(false);
      else if (message.type === "terminate") void stop(true);
      else if (message.type === "snapshot") publish({ type: "tasks", tasks: tasks.snapshot() });
    }, error => { console.error("Control protocol failed.", error); void stop(true); });
    control.on("close", () => { if (state !== "stopping") void stop(true); });
    await welcomed;
  }
  process.env.NODE_ENV = "production";
  const { default: next } = await import("next");
  app = next({ dev: false, dir: webRoot, hostname, port });
  await app.prepare();
  server.on("error", error => {
    publish({ type: "error", code: error.code ?? "SERVER_ERROR", message: "The HTTP service could not start." });
    console.error("HTTP service failed.", error);
    process.exitCode = 1;
    void stop(true);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolve);
  });
  state = "running";
  console.log("File Desk is listening on http://" + hostname + ":" + port + "/files");
  publish({ type: "state", state, tasks: [] });
  timer = setInterval(() => publish({ type: "tasks", tasks: tasks.snapshot() }), 250);
  process.on("SIGINT", () => void stop(true));
  process.on("SIGTERM", () => void stop(true));
}

start().catch(error => {
  publish({ type: "error", code: error.code ?? "START_FAILED", message: "The service could not start. Check the logs." });
  console.error("Service startup failed.", error);
  clearInterval(timer);
  for (const socket of sockets) socket.destroy();
  control?.destroy();
  process.exit(1);
});
