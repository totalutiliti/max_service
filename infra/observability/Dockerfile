ARG GO_IMAGE=golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651
ARG PROMETHEUS_IMAGE=prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893

FROM ${GO_IMAGE} AS build

ARG TARGETARCH=amd64
ARG PROMETHEUS_VERSION=3.13.1
ARG PROMETHEUS_COMMIT=73ff57ce2b8161059ac7fe5188f03f1c3d22b29a
ARG GRPC_VERSION=1.82.1

RUN git clone --depth 1 --branch "v${PROMETHEUS_VERSION}" --single-branch \
      --filter=blob:none https://github.com/prometheus/prometheus.git /src \
    && test "$(git -C /src rev-parse HEAD)" = "${PROMETHEUS_COMMIT}"

ADD --checksum=sha256:2194bfbb5d36457df2b8f480037ce89786ee32f03b5ee6ad5597989f14deafb0 \
    https://github.com/prometheus/prometheus/releases/download/v3.13.1/prometheus-web-ui-3.13.1.tar.gz \
    /tmp/prometheus-web-ui.tar.gz

WORKDIR /src

# The release UI artifact is published separately from the source tag.
RUN tar -xzf /tmp/prometheus-web-ui.tar.gz -C web/ui \
    && scripts/compress_assets.sh

# Prometheus 3.13.1 LTS predates the grpc 1.82.1 security release. Keep the
# upstream LTS source fixed and update only the affected direct dependency.
RUN go mod edit -require="google.golang.org/grpc@v${GRPC_VERSION}" \
    && go mod download

RUN GOWORK=off CGO_ENABLED=0 GOOS=linux GOARCH="${TARGETARCH}" \
      go build -mod=mod -trimpath -tags="netgo,builtinassets" \
      -ldflags="-s -w \
        -X github.com/prometheus/common/version.Version=${PROMETHEUS_VERSION}+maxservice.1 \
        -X github.com/prometheus/common/version.Revision=${PROMETHEUS_COMMIT} \
        -X github.com/prometheus/common/version.Branch=v${PROMETHEUS_VERSION}-grpc-${GRPC_VERSION} \
        -X github.com/prometheus/common/version.BuildUser=max-service" \
      -o /out/prometheus ./cmd/prometheus \
    && GOWORK=off CGO_ENABLED=0 GOOS=linux GOARCH="${TARGETARCH}" \
      go build -mod=mod -trimpath -tags="netgo,builtinassets" \
      -ldflags="-s -w \
        -X github.com/prometheus/common/version.Version=${PROMETHEUS_VERSION}+maxservice.1 \
        -X github.com/prometheus/common/version.Revision=${PROMETHEUS_COMMIT} \
        -X github.com/prometheus/common/version.Branch=v${PROMETHEUS_VERSION}-grpc-${GRPC_VERSION} \
        -X github.com/prometheus/common/version.BuildUser=max-service" \
      -o /out/promtool ./cmd/promtool

FROM ${PROMETHEUS_IMAGE}

ARG PROMETHEUS_COMMIT=73ff57ce2b8161059ac7fe5188f03f1c3d22b29a
ARG GRPC_VERSION=1.82.1

LABEL org.opencontainers.image.revision="${PROMETHEUS_COMMIT}" \
      com.max-service.prometheus.grpc-version="${GRPC_VERSION}" \
      com.max-service.prometheus.security-patch="GHSA-hrxh-6v49-42gf"

COPY --from=build /out/prometheus /bin/prometheus
COPY --from=build /out/promtool /bin/promtool
