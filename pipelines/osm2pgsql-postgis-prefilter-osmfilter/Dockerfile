FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# osmctools: osmconvert + osmfilter (PBF→o5m, then filter). No osmium-tool — prefilter uses osmfilter only.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    postgresql \
    postgis \
    postgresql-16-postgis-3 \
    osm2pgsql \
    osmctools \
    gdal-bin \
    tippecanoe \
    jq \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages --no-cache-dir "geopandas>=1.0.0" "pyarrow>=15.0.0"

WORKDIR /workspace
