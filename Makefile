# help is the default goal so a bare `make` documents the harness
.DEFAULT_GOAL := help

.PHONY: help up seed down drop test test-unit test-integration graph graph-viz

help: ## List available targets
	@echo "mongodb-by-example - available targets:"
	@echo ""
	@echo "  help        Show this list"
	@echo "  up          Start the shared mongod (idempotent) and ensure the replica set"
	@echo "  seed        Generate and load faker seed data"
	@echo "  down        Stop the shared container, keep data"
	@echo "  drop        Drop this project's database (mongodb-by-example) only"
	@echo "  test-unit   Run the unit tier (no database needed)"
	@echo "  test-integration  Run the integration tier (needs Mongo up)"
	@echo "  test        Run unit then integration, in that order"
	@echo "  graph       Rebuild the knowledge graph (code + docs) and HTML"
	@echo "  graph-viz   Regenerate graph.html and report from the existing graph"

up: ## Start the shared mongod (idempotent) and ensure the replica set
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
	@# the poll above exits 0 on its own shell once ready, so make reaches this
	@# line only when mongod answers; rs.initiate is idempotent (no-op if already up)
	./scripts/rs-init.sh

seed: ## Generate and load faker seed data
	npm run seed

# stops the shared mongod for every project, not just this one: the blast radius
# is the whole shared server, so this is not a per-project teardown
down: ## Stop the shared container, keep data
	docker compose down

# drops only THIS project's database; the shared server and every other
# project's database are untouched. in-container mongosh so no host mongosh needed
drop: ## Drop this project's database (mongodb-by-example) only
	docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("mongodb-by-example").dropDatabase()'
	@echo "database mongodb-by-example dropped"

test-unit: ## Run the unit tier (no database needed)
	npm run test:unit

test-integration: ## Run the integration tier (needs Mongo up)
	npm run test:integration

# unit before integration so a logic break fails fast without needing the database
test: test-unit test-integration ## Run unit then integration, in that order

# Knowledge graph (graphify). Model/env pinned so the target is self-contained.
# Code is auto-refreshed by the post-commit hook (AST, no LLM); this target is
# for refreshing docs (needs the LLM) and rebuilding the HTML view.
GRAPHIFY_ENV := OLLAMA_MODEL=graphify OLLAMA_API_KEY=x

graph: ## Rebuild the knowledge graph: code (AST) + docs (LLM) + HTML
	$(GRAPHIFY_ENV) graphify . --backend ollama --token-budget 8000 --max-concurrency 1

graph-viz: ## Regenerate graph.html and the report from the existing graph
	$(GRAPHIFY_ENV) graphify cluster-only . --backend ollama
