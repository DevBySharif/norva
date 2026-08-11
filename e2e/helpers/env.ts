import { readFileSync } from "node:fs";
export function privateEnv(name: string) { const line = readFileSync(".env", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`)); if (!line) throw new Error(`Missing ${name} in local environment.`); return line.slice(name.length + 1).replace(/^"|"$/g, ""); }
