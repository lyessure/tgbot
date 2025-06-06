FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY bot /app
COPY web/static /app/web/static
COPY web/templates /app/web/templates
RUN chmod +x /app/bot

CMD ["/app/bot"]

