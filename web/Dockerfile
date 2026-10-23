# syntax=docker/dockerfile:1
#
# The Web image (spec section 13, decision 0029): the production build of the React app and a Caddy built from source, so the
# Go standard library and golang.org/x/net in the binary are the patched ones (the upstream caddy image lagged behind Go's
# security fixes). Build from the web folder:
#   docker build -t nodeable-web web
#
# The site's own Caddyfile (hostnames, TLS, the /api, /hubs and /otlp routes) belongs to the deployment and is mounted
# at /etc/caddy/Caddyfile there (decision 0024). The default one only serves the files on port 80, so the image runs alone.
#
# Versions are set here, in one place. To bump them see "Bumping the Caddy build" in docs/dev/HANDOFF.md.
ARG GO_VERSION=1.26.10
ARG CADDY_VERSION=v2.11.7
ARG XNET_VERSION=v0.60.0
ARG XCADDY_VERSION=v0.4.7
ARG ALPINE_VERSION=3.23

FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Caddy is cross-compiled on the build machine (pure Go, no cgo), so the arm64 image does not need QEMU for this step.
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS caddy-build
ARG CADDY_VERSION
ARG XNET_VERSION
ARG XCADDY_VERSION
ARG TARGETOS
ARG TARGETARCH
# Fail instead of silently downloading a different Go toolchain than the pinned one.
ENV GOTOOLCHAIN=local CGO_ENABLED=0
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@${XCADDY_VERSION}
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} xcaddy build ${CADDY_VERSION} \
      --replace golang.org/x/net=golang.org/x/net@${XNET_VERSION} \
      --output /caddy

FROM alpine:${ALPINE_VERSION} AS final
COPY --from=caddy-build /caddy /usr/bin/caddy

# Same layout as the upstream image: config in /etc/caddy, state in /config and /data. It runs as the unprivileged user
# "caddy"; the binary may bind ports 80 and 443 through a file capability instead of running as root.
RUN apk add --no-cache ca-certificates mailcap tzdata libcap-setcap \
 && setcap cap_net_bind_service=+ep /usr/bin/caddy \
 && apk del libcap-setcap \
 && adduser -D -u 1000 caddy \
 && mkdir -p /config /data /etc/caddy /srv \
 && chown caddy:caddy /config /data \
 && printf ':80 {\n\troot * /srv\n\tencode\n\tfile_server\n}\n' > /etc/caddy/Caddyfile

COPY --from=build /app/dist /srv

ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
USER caddy
EXPOSE 80 443 443/udp
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
