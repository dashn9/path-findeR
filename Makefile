# path-findeR — build + run orchestration.
# The Go service links against the Rust core's cdylib, so the Rust build must
# always run first. `make run` does both in one shot.

CARGO ?= cargo
GO ?= go
SERVICE_DIR := path-finder-service

# The Go service loads path_finder_core.dll/.so at runtime; expose target/release
# on the dynamic-loader path so `make run` and `make service` just work.
ifeq ($(OS),Windows_NT)
    export PATH := $(CURDIR)/target/release;$(PATH)
else
    UNAME_S := $(shell uname -s)
    ifeq ($(UNAME_S),Darwin)
        export DYLD_LIBRARY_PATH := $(CURDIR)/target/release:$(DYLD_LIBRARY_PATH)
    else
        export LD_LIBRARY_PATH := $(CURDIR)/target/release:$(LD_LIBRARY_PATH)
    endif
endif

.PHONY: run build core service test clean

## run: build the Rust core, then start the Go service (foreground, port 7117).
run: core
	$(GO) run -C $(SERVICE_DIR) ./cmd/server

## build: produce release artifacts for both the Rust core and the Go service.
build: core service

core:
	$(CARGO) build --release

service: core
	$(GO) build -C $(SERVICE_DIR) -o ../path-finder-service-bin ./cmd/server

## test: run Rust workspace tests + Go service tests.
test:
	$(CARGO) test --workspace
	$(GO) test -C $(SERVICE_DIR) ./...

## clean: drop Rust and Go build outputs.
clean:
	$(CARGO) clean
	rm -f path-finder-service-bin
