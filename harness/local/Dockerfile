# Preview cell image (harness/local/run-cell.sh): the closest local stand-in for the ubuntu-latest runner of
# nightly.yml. Ubuntu 24.04, Node 24.21.0 with Corepack, user om-cell (no sudo, no extra groups). The harness itself is
# not baked in: run-cell.sh copies harness/ into each container, as the `prepare` step does on the runner.
# Not part of harnessHash: receipts from this image say `harness.runner: preview-docker`.
#
# Two targets: `fw` (iptables only; run-cell.sh runs harness/local/cell-firewall.sh in it with --net host and
# NET_ADMIN to fence the cell network) and `cell` (the default, last stage).
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS fw
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends iptables \
  && rm -rf /var/lib/apt/lists/*
LABEL org.opencontainers.image.title="om-modules preview cell firewall"

FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac AS cell

ARG NODE_VERSION=24.21.0
ARG NODE_SHA256_X64=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
ARG NODE_SHA256_ARM64=6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils openssl git procps \
  && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
  arch=$(dpkg --print-architecture); \
  case "$arch" in \
    amd64) dist=x64; sum=$NODE_SHA256_X64 ;; \
    arm64) dist=arm64; sum=$NODE_SHA256_ARM64 ;; \
    *) echo "unsupported architecture $arch" >&2; exit 1 ;; \
  esac; \
  file="node-v${NODE_VERSION}-linux-${dist}.tar.xz"; \
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${file}"; \
  echo "${sum}  ${file}" | sha256sum -c -; \
  tar -xJf "$file" -C /usr/local --strip-components=1 --no-same-owner; \
  rm "$file"; \
  corepack enable; \
  node --version; corepack --version

# The base image has `ubuntu` (uid 1000), which would collide with the owner of the bind-mounted output directory.
RUN userdel -r ubuntu 2>/dev/null || true; \
  useradd -m -u 2000 -s /bin/bash om-cell; \
  chmod 0755 /home/om-cell; \
  install -d -o om-cell -m 0755 /home/om-cell/logs /home/om-cell/.yarn /home/om-cell/.yarn/berry

LABEL org.opencontainers.image.title="om-modules preview cell" \
  org.opencontainers.image.description="Ubuntu 24.04, Node 24.21.0, Corepack, user om-cell without sudo"
