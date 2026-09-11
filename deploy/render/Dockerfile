# The data refresh, as a Render cron job.
#
# WHY DOCKER AND NOT A NATIVE RUNTIME
# -----------------------------------
# The pipeline needs BOTH runtimes: the scrapers are Python (pdfplumber, lxml,
# pandas) and the orchestrator, scripts/refresh-data.mjs, is Node. Render's
# native environments are one language each, so a native service would have to
# reimplement half the pipeline in the other language — which is the same
# rewrite docs/RUNNING-WITHOUT-ACTIONS.md declines for Apps Script and Workers.
# A container is the honest way to have both.
#
# WHY DEPENDENCIES ARE BAKED IN HERE
# ----------------------------------
# Render pulls the image fresh for every cron run and tears the container down
# when the process exits; nothing is reused between runs and a cron job cannot
# have a persistent disk. So anything installed at RUN time is paid for on
# every single run, twice a day, forever. Installed once at BUILD time instead.
FROM node:22-bookworm-slim

# git: the refresh commits and pushes its own result.
# python3 + build deps: the scrapers.
# ca-certificates: HTTPS to CBK, KNBS, the Treasury and the World Bank.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 python3-pip python3-dev ca-certificates util-linux \
      build-essential libxml2-dev libxslt1-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /deps

# Only the manifests, so this layer survives every commit that does not change
# a dependency — which is almost all of them.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY backend/requirements.txt ./backend/requirements.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir \
      -r backend/requirements.txt

COPY deploy/render/refresh.sh /usr/local/bin/render-refresh
RUN chmod +x /usr/local/bin/render-refresh

CMD ["/usr/local/bin/render-refresh"]
