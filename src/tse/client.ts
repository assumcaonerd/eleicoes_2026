import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";

let nextAllowed = 0;

async function throttle() {
  const gap = Math.ceil(1000 / config.requestsPerSecond);
  const now = Date.now();
  const wait = Math.max(0, nextAllowed - now);
  nextAllowed = Math.max(now, nextAllowed) + gap;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  await throttle();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "eleicoes-2026/0.1 (+dados-publicos-tse)" },
  });
  if (!response.ok) throw new Error(`TSE ${response.status} em ${url}`);
  return response.json() as Promise<T>;
}

export async function fetchAndPersist<T = unknown>(url: string): Promise<{ data: T; file: string }> {
  const data = await fetchJson<T>(url);
  const digest = createHash("sha1").update(url).digest("hex");
  const dir = path.resolve(config.rawDataDir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${digest}.json`);
  await writeFile(file, JSON.stringify({ url, downloadedAt: new Date().toISOString(), data }), "utf8");
  return { data, file };
}
