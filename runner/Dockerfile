FROM mcr.microsoft.com/playwright:v1.53.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY run-job.js ./

USER pwuser

CMD ["node", "/app/run-job.js", "/work/job.json", "/artifacts"]

