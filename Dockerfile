FROM node:24-bookworm

# Install git, chromium (for ./bin/browse), and core CLI utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    chromium \
    curl \
    jq \
    sqlite3 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable && corepack prepare pnpm@11.23.0 --activate

WORKDIR /workspace/ignis

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Initialize a clean single-commit Git repository if .git is not present
# so `./bin/wt` and the Protected Core Time Machine work out of the box.
RUN git config --global user.email "ignis-oss@local" && \
    git config --global user.name "Ignis OSS" && \
    if [ ! -d .git ]; then \
      git init -b main && \
      git add -A && \
      git commit -m "Initial commit: Ignis OSS (Open-Source Self-Building AI Workspace)"; \
    fi

EXPOSE 3400

CMD ["pnpm", "dev"]
