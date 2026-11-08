# Website: dieselbe server.cjs wie auf Daki. Sie holt public/ selbst alle 30 s
# vom Branch main, ohne Neustart.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/site
COPY hosting/daki/server.cjs ./server.cjs
COPY hosting/daki/media-store.cjs ./media-store.cjs
RUN mkdir -p .deploy && chown -R node:node /srv/site
USER node
ENV NODE_ENV=production PORT=4129 TRUST_PROXY=1
EXPOSE 4129
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:4129/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.cjs"]
