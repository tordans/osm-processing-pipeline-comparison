FROM debian:trixie

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/Berlin

# osm2pgsql >= 2.3 from trixie-backports (flex :as_point / n_points).
RUN echo "deb http://deb.debian.org/debian trixie-backports main" > /etc/apt/sources.list.d/backports.list

# PostgreSQL 16 (tilda-geo production); PG 17 lacks default gist opclass for integer minzoom indexes.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    gdal-bin \
    jq \
    liblua5.3-dev \
    lua5.3 \
    luarocks \
    osmium-tool \
    postgresql-16 \
    postgresql-16-postgis-3 \
    python3 \
    python3-pip \
    tippecanoe \
    wget \
    && apt-get install -y -t trixie-backports --no-install-recommends osm2pgsql \
    && rm -rf /var/lib/apt/lists/*

RUN luarocks install inspect \
    && luarocks install penlight \
    && luarocks install ftcsv

RUN python3 -m pip install --break-system-packages --no-cache-dir "geopandas>=1.0.0" "pyarrow>=15.0.0"

WORKDIR /workspace
