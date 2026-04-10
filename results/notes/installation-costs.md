# Installation and Setup Cost Notes

This phase documents installation and setup complexity, but does not include install time in benchmark runtime totals.

## Why excluded from runtime totals

- Installation is usually done once per server image.
- Runtime benchmarks focus on recurring processing costs.
- Package manager and network variability can dominate install timing.

## What we document per pipeline

- Required binaries and services
- Docker image base and installed packages
- Build complexity (simple/moderate/high)
- Operational implications (image size, startup complexity)

## Optional future measurement design

If needed in a later phase, add a separate "cold environment setup benchmark":

- build image from scratch with no cache
- record total image build time
- record image size
- keep this metric separate from processing runtime
