import { randomUUID } from "node:crypto";
export const runId = () => randomUUID().slice(0, 8);
export const e2eSlug = (name: string) => `e2e-${name}-${runId()}`;
