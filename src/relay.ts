import { EnvError, loadEnvFile, readRelayEnv } from "./config/env.js";
import { createAccelerationRelayServer } from "./modules/relay/index.js";

loadEnvFile(new URL("../.env", import.meta.url).pathname);

try {
  const server = await createAccelerationRelayServer(readRelayEnv());
  console.log(`WebSpeak acceleration relay listening on ${server.host}:${server.port}`);

  const shutdown = (): void => {
    server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error: unknown) {
  if (!(error instanceof EnvError)) throw error;
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}
