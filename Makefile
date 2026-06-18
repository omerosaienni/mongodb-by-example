# help is the default goal so a bare `make` documents the harness
.DEFAULT_GOAL := help

.PHONY: help up rs-init seed down nuke bootstrap

help: ## List available targets
	@echo "Mongo playground - available targets:"
	@echo ""
	@echo "  help        Show this list"
	@echo "  up          Start MongoDB in Docker"
	@echo "  rs-init     Initialise the single node replica set (idempotent)"
	@echo "  seed        Generate and load faker seed data (not yet implemented)"
	@echo "  down        Stop the container, keep data"
	@echo "  nuke        Stop the container and delete the named volume"
	@echo "  bootstrap   up + rs-init in one go"

up: ## Start MongoDB in Docker
	docker compose up -d
	@echo "waiting for mongod to accept connections..."
	@# poll the server rather than a fixed sleep: the image runs initdb on first
	@# boot, so readiness time is not constant. ping needs no auth and no RS.
	@for i in $$(seq 1 30); do \
		if docker compose exec -T mongo mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then \
			echo "mongod is up"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "mongod did not become ready" >&2; \
	exit 1

rs-init: ## Initialise the single node replica set (idempotent)
	./scripts/rs-init.sh

seed: ## Generate and load faker seed data
	@echo "seed: not yet implemented"

down: ## Stop the container, keep data
	docker compose down

nuke: ## Stop the container and delete the named volume
	docker compose down -v
	@# confirm the volume is actually gone: a deterministic name lets us assert it
	@if docker volume ls --format '{{.Name}}' | grep -qx mongo-playground-data; then \
		echo "volume mongo-playground-data still present" >&2; \
		exit 1; \
	fi
	@echo "container and volume removed"

bootstrap: up rs-init ## up + rs-init, no manual steps
