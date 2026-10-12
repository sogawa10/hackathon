FROM golang:1.26.9-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server .

FROM alpine:3.20 AS serve

RUN apk add --no-cache tzdata ca-certificates

WORKDIR /app
COPY --from=build /out/server ./server

EXPOSE 3000

ENTRYPOINT ["/app/server"]
