/**
 * Container limits, read from the cgroup. Remotion sizes itself from the host instead:
 * parallel encoding from /proc/meminfo MemAvailable and libx264 threads from the host core
 * count. On ks-aw-01 (32 cores) that gave ffmpeg threads=34 inside a 1 GiB / 2 CPU container
 * and the memcg OOM killer stopped ffmpeg mid-render (2026-11-16).
 */
import fs from "fs";

function readFirst(paths: string[]): string | null {
  for (const p of paths) {
    try {
      return fs.readFileSync(p, "utf8").trim();
    } catch { /* try next */ }
  }
  return null;
}

/** Bytes, or null when unlimited / not in a cgroup. */
export function cgroupMemoryLimit(root = "/sys/fs/cgroup"): number | null {
  const raw = readFirst([`${root}/memory.max`, `${root}/memory/memory.limit_in_bytes`]);
  if (!raw || raw === "max") return null;
  const n = Number(raw);
  // cgroup v1 reports "unlimited" as a huge page-aligned number.
  if (!Number.isFinite(n) || n <= 0 || n >= 2 ** 60) return null;
  return n;
}

/** Whole CPUs the quota allows (at least 1), or null when unlimited. */
export function cgroupCpuLimit(root = "/sys/fs/cgroup"): number | null {
  const v2 = readFirst([`${root}/cpu.max`]);
  if (v2) {
    const [quota, period] = v2.split(/\s+/);
    if (quota === "max") return null;
    const q = Number(quota), p = Number(period);
    if (q > 0 && p > 0) return Math.max(1, Math.floor(q / p));
    return null;
  }
  const q = Number(readFirst([`${root}/cpu/cpu.cfs_quota_us`, `${root}/cpu,cpuacct/cpu.cfs_quota_us`]));
  const p = Number(readFirst([`${root}/cpu/cpu.cfs_period_us`, `${root}/cpu,cpuacct/cpu.cfs_period_us`]));
  if (q > 0 && p > 0) return Math.max(1, Math.floor(q / p));
  return null;
}

/**
 * Remotion's own rule (renderer/dist/prestitcher-memory-usage.js) applied to the container
 * limit instead of host MemAvailable: ffmpeg needs ~1 GB per megapixel when it encodes while
 * frames render. null limit = leave Remotion's default.
 */
export function allowParallelEncoding(width: number, height: number, memoryLimit: number | null): boolean | undefined {
  if (memoryLimit == null) return undefined;
  const estimated = width * height * 1000;
  return memoryLimit - estimated > 2_000_000_000 && estimated / memoryLimit < 0.5;
}

/** Adds `-threads n` as an output option (the output path is always the last ffmpeg arg). */
export function withEncoderThreads(args: string[], threads: number | null): string[] {
  if (!threads || args.length === 0) return args;
  return [...args.slice(0, -1), "-threads", String(threads), args[args.length - 1]];
}
