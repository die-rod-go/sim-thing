.PHONY: help install dev check test soak measure reset build

help:
	@echo "make install  Install all dependencies"
	@echo "make dev      Run the sim server and the client together"
	@echo "make check    Typecheck and lint every workspace"
	@echo "make test     Run all tests"
	@echo "make soak     Run the full three-sim-day headless soak (minutes)"
	@echo "make measure  Measure the saved run (no LLM calls); SAVE=<path> for another save"
	@echo "make reset    Delete the saved sim database and reseed"
	@echo "make build    Production build of the client"

install:
	npm install

dev:
	npm run dev

check:
	npm run check

test:
	npm test

soak:
	npm run soak -w @village/server

measure:
	npm run measure -w @village/server --silent -- $(SAVE)

reset:
	npm run reset

build:
	npm run build
