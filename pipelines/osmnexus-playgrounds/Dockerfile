FROM rust:1-bookworm AS nexus-builder

ARG NEXUS_REPO=https://github.com/rush42/OSMnexus.git
ARG NEXUS_REV=1eae18d4b28c94c29e9575c38aeed2476a87ce03

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    libpq-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN git clone "${NEXUS_REPO}" /src/osmnexus \
    && cd /src/osmnexus \
    && git checkout "${NEXUS_REV}"

COPY patches/standalone-nodes.patch /src/osmnexus/patches/standalone-nodes.patch
RUN cd /src/osmnexus && git apply patches/standalone-nodes.patch && cargo build --release

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql \
    postgis \
    postgresql-16-postgis-3 \
    osmium-tool \
    gdal-bin \
    tippecanoe \
    jq \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=nexus-builder /src/osmnexus/target/release/osmnexus /usr/local/bin/osmnexus

RUN python3 -m pip install --break-system-packages --no-cache-dir \
    "geopandas>=1.0.0" \
    "pyarrow>=15.0.0" \
    "shapely>=2.0.0"

WORKDIR /workspace
