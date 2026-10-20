# syntax=docker/dockerfile:1
FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac

# Development/test host only; these packages are not application dependencies.
RUN --mount=type=secret,id=system_ca,required=true \
    apt-get -o Acquire::https::CaInfo=/run/secrets/system_ca update \
    && DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::https::CaInfo=/run/secrets/system_ca install -y --no-install-recommends \
      ca-certificates build-essential curl wget file pkg-config \
      libwebkit2gtk-4.1-dev libgtk-3-dev libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev \
      xvfb xauth openbox dbus-x11 at-spi2-core \
      python3 python3-gi gir1.2-atspi-2.0 \
      xdotool xclip x11-utils scrot fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
