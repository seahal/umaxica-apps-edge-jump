# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-trixie
ARG DOCKER_UID=1000
ARG DOCKER_USER=jump
ARG DOCKER_GID=1000
ARG DOCKER_GROUP=group

FROM node:${NODE_VERSION} AS base

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG DEBIAN_FRONTEND=noninteractive
ARG DOCKER_UID
ARG DOCKER_USER
ARG DOCKER_GID
ARG DOCKER_GROUP

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dumb-init \
    git \
    less \
    libfontconfig1 \
    libfreetype6 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    openssh-client \
    sudo \
    tzdata \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack install --global pnpm@latest

RUN set -eux; \
  base_user=node; \
  base_group=node; \
  target_user="${DOCKER_USER}"; \
  target_group="${DOCKER_GROUP}"; \
  groupmod --gid "${DOCKER_GID}" "${base_group}"; \
  if [ "${target_group}" != "${base_group}" ]; then \
    groupmod --new-name "${target_group}" "${base_group}"; \
  else \
    target_group="${base_group}"; \
  fi; \
  usermod --gid "${DOCKER_GID}" --shell /bin/bash "${base_user}"; \
  if [ "${target_user}" != "${base_user}" ]; then \
    usermod --login "${target_user}" --home "/home/${target_user}" --move-home "${base_user}"; \
  else \
    target_user="${base_user}"; \
  fi; \
  usermod --uid "${DOCKER_UID}" "${target_user}"; \
  usermod --gid "${DOCKER_GID}" "${target_user}"; \
  usermod --append --groups sudo "${target_user}"; \
  install -d -m 0755 -o "${target_user}" -g "${target_group}" /workspaces; \
  install -d -m 0755 -o "${target_user}" -g "${target_group}" /workspaces/umaxica-apps-jump

RUN printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${DOCKER_USER}" > /etc/sudoers.d/devcontainer \
  && chmod 0440 /etc/sudoers.d/devcontainer

FROM base AS development

ARG DOCKER_UID
ARG DOCKER_USER
ARG DOCKER_GID
ARG DOCKER_GROUP

# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bat \
    entr \
    fd-find \
    fzf \
    htop \
    jq \
    yq \
    ncdu \
    ripgrep \
    tig \
    tree \
    watch \
    bash \
    curl \
    wget \
    bubblewrap \
    python3 \
  && rm -rf /var/lib/apt/lists/*

ENV HOME=/home/${DOCKER_USER} \
    USER=${DOCKER_USER} \
    LANG=C.UTF-8 \
    SHELL=/bin/bash

# Create necessary directories with proper permissions
RUN mkdir -p \
    "${HOME}/.config" \
    "${HOME}/workspace" \
    "${HOME}/workspace/node_modules" \
  && chown -R "${DOCKER_UID}:${DOCKER_GID}" "${HOME}" \
  && chmod -R 755 "${HOME}"

WORKDIR ${HOME}/workspace


RUN rm -rf "${HOME}/.cache"
RUN rm -rf "${HOME}/.local"

# Install Vite+ (unified toolchain)
RUN curl -fsSL https://vite.plus | bash

USER ${DOCKER_USER}:${DOCKER_GROUP}

CMD ["sleep", "infinity"]
