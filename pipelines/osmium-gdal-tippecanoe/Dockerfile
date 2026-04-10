FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    osmium-tool \
    gdal-bin \
    tippecanoe \
    jq \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu's gdal-bin build often omits the Parquet driver; GeoParquet is written via PyArrow.
RUN python3 -m pip install --break-system-packages --no-cache-dir "geopandas>=1.0.0" "pyarrow>=15.0.0"

WORKDIR /workspace
