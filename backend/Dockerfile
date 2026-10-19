FROM golang:1.26.4-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -tags dev -ldflags="-s -w" -o /bin/jike-auth-api .

FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 appuser

COPY --from=builder /bin/jike-auth-api /bin/jike-auth-api

RUN mkdir -p uploads && chown -R appuser:appuser /app
USER appuser

EXPOSE 8081

CMD ["/bin/jike-auth-api"]
