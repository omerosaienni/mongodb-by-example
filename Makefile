# help is the default goal so a bare `make` documents the harness
.DEFAULT_GOAL := help

.PHONY: help up rs-init seed down nuke bootstrap

help: ## List available targets
	@echo "Mongo playground - available targets:"
	@echo ""
	@echo "  help        Show this list"
	@echo "  up          Start MongoDB in Docker (not yet implemented)"
	@echo "  rs-init     Initialise the single node replica set (not yet implemented)"
	@echo "  seed        Generate and load faker seed data (not yet implemented)"
	@echo "  down        Stop the container, keep data (not yet implemented)"
	@echo "  nuke        Stop the container and delete all data (not yet implemented)"
	@echo "  bootstrap   up + rs-init + seed in one go (not yet implemented)"

up: ## Start MongoDB in Docker
	@echo "up: not yet implemented"

rs-init: ## Initialise the single node replica set
	@echo "rs-init: not yet implemented"

seed: ## Generate and load faker seed data
	@echo "seed: not yet implemented"

down: ## Stop the container, keep data
	@echo "down: not yet implemented"

nuke: ## Stop the container and delete all data
	@echo "nuke: not yet implemented"

bootstrap: ## up + rs-init + seed
	@echo "bootstrap: not yet implemented"
