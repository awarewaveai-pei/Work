// Remediation catalog registry (A2). Add new entries here — each must honor
// the four-stage contract in ./types.ts and the AGENTS.md red lines (never
// secrets / auth / payment / migrations; precheck always runs first).

import type { Remediation } from "./types";
import { restartUnhealthyContainer } from "./restart-unhealthy-container";

export const REMEDIATIONS: Remediation[] = [restartUnhealthyContainer];
