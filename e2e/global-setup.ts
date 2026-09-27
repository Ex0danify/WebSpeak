import { assertFreshBuild } from "./helpers/build-stamp";

// Every browser test serves web/dist, so refuse to run against a stale bundle.
export default function globalSetup() {
  assertFreshBuild();
}
