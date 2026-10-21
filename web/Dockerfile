# syntax=docker/dockerfile:1
#
# The Web image (spec section 13, decision 0029): the production build of the React app, ready for Caddy to serve. Build
# from the web folder:
#   docker build -t nodeable-web web
#
# The site's own Caddyfile (hostnames, TLS, the /api, /hubs and /otlp routes) belongs to the deployment and is mounted
# there (decision 0024), so this image holds the files and no configuration and no secrets.

FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2-alpine AS final
COPY --from=build /app/dist /srv

# Caddy's image runs as root so it can bind ports 80 and 443; the deployment's Caddy needs that. These files are read-only content.
EXPOSE 80 443
