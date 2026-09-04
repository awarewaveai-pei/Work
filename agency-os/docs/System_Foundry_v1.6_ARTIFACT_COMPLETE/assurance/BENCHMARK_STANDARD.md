# Benchmark Standard

A performance/scale number is only trustworthy if it answers a stated question under a stated, reproducible workload — a number with no stated question behind it is marketing, not benchmarking.

Required per benchmark: the specific question it answers (e.g. "p99 latency at 10x current peak load"), a workload shape realistic to actual production traffic (not a best-case synthetic pattern chosen to look good), a fixed environment specification (hardware/instance class, data volume, warm vs. cold state), the metrics captured and their acceptance thresholds decided before the run, and a repeatability requirement — the benchmark MUST be re-runnable by someone other than its author with the same result within a stated tolerance.

Benchmarks MUST be re-run and compared against prior results whenever a change could plausibly affect the measured path (regression detection), not only once at launch. A microbenchmark of an isolated function MUST NOT be presented as evidence of system-level performance.
