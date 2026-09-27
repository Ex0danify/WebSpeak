import { realServerFromEnv, stopServer } from "./server";

// Removes the container, its network and its (tmpfs) data. Runs after a failed run too, and when
// the setup stopped before it started anything (no license), there is nothing to remove.
export default async function globalTeardown() {
  let server;
  try {
    server = realServerFromEnv();
  } catch {
    return;
  }
  await stopServer(server);
}
