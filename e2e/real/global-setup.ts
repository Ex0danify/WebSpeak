import { provisionServer } from "./provision";
import { WebQuery, exportToEnvironment, startServer } from "./server";

// The suite's own server, in Docker, on non-default ports. It refuses to start until a person has
// accepted the TeamSpeak license (`requireLicenseAccepted`, called by `startServer`).
export default async function globalSetup() {
  const server = await startServer();
  exportToEnvironment(server);
  // Flood limits, the lobby every test starts from, and rights that are asserted, never assumed.
  await provisionServer(server, WebQuery.for(server));
}
