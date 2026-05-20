FROM rust:1-bookworm AS cosmo-builder

ARG COSMO_REPO=https://codeberg.org/mvexel/cosmo.git
ARG COSMO_REV=11ff3d2418a098703fb684d3c276235e1d9d9d84

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    git \
    libproj-dev \
    libsqlite3-dev \
    pkg-config \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone "${COSMO_REPO}" /src/cosmo \
    && cd /src/cosmo \
    && git checkout "${COSMO_REV}" \
    && cargo build --release

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gdal-bin \
    tippecanoe \
    jq \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=cosmo-builder /src/cosmo/target/release/cosmo /usr/local/bin/cosmo

RUN python3 -m pip install --break-system-packages --no-cache-dir "geopandas>=1.0.0" "pyarrow>=15.0.0"

WORKDIR /workspace
