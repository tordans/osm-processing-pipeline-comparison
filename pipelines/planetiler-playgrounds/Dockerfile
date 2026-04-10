FROM eclipse-temurin:21-jre-jammy

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

ARG PLANETILER_VERSION=0.10.2
RUN curl -fsSL -o /opt/planetiler.jar \
    "https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar"

WORKDIR /workspace
