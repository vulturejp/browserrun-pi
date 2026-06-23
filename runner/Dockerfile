FROM mcr.microsoft.com/playwright:v1.53.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json run-job.ts ./
RUN npm run build && npm prune --omit=dev

USER pwuser

CMD ["node", "/app/dist/run-job.js", "/work/job.json", "/artifacts"]
