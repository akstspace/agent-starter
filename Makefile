UV ?= uv
API_HOST ?= 0.0.0.0
API_PORT ?= 8000
WEB_UI_PORT ?= 5173
WEB_UI_DIR ?= test-ui
BUN ?= bun
ENV_FILE ?= .env
ENV_EXAMPLE ?= .env.example
VENV_DIR ?= .venv

.PHONY: ensure-env ensure-venv install-deps reinstall-deps start api-dev webui-dev test-webui-build test lint precommit-install precommit-run clean

ensure-env:
	@if [ ! -f "$(ENV_FILE)" ]; then \
		if [ -f "$(ENV_EXAMPLE)" ]; then \
			cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
			echo "Created $(ENV_FILE) from $(ENV_EXAMPLE)"; \
		else \
			echo "Missing $(ENV_FILE) and $(ENV_EXAMPLE). Create one manually."; \
			exit 1; \
		fi; \
	fi

ensure-venv:
	@if [ ! -d "$(VENV_DIR)" ]; then \
		$(UV) venv "$(VENV_DIR)"; \
		echo "Created virtualenv at $(VENV_DIR)"; \
	fi

install-deps: ensure-env ensure-venv
	$(UV) sync --extra dev
	cd $(WEB_UI_DIR) && $(BUN) install

reinstall-deps:
	rm -rf $(VENV_DIR)
	rm -rf $(WEB_UI_DIR)/node_modules
	rm -f $(WEB_UI_DIR)/bun.lockb $(WEB_UI_DIR)/package-lock.json $(WEB_UI_DIR)/pnpm-lock.yaml $(WEB_UI_DIR)/yarn.lock
	$(MAKE) install-deps

api-dev: ensure-env ensure-venv
	$(UV) run uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT)

webui-dev:
	cd $(WEB_UI_DIR) && $(BUN) run dev --host $(API_HOST) --port $(WEB_UI_PORT)

start: ensure-env ensure-venv
	bash -lc '$(UV) run uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT) & API_PID=$$!; trap "kill $$API_PID" EXIT; cd $(WEB_UI_DIR) && $(BUN) run dev --host $(API_HOST) --port $(WEB_UI_PORT)'

test: ensure-env ensure-venv
	$(UV) run pytest

test-webui-build:
	cd $(WEB_UI_DIR) && $(BUN) run build

lint: ensure-env ensure-venv
	$(UV) run ruff check .
	$(UV) run ruff format --check .

precommit-install: ensure-env ensure-venv
	$(UV) run prek install

precommit-run: ensure-env ensure-venv
	$(UV) run prek run --all-files

clean:
	find . -type d -name '__pycache__' -exec rm -rf {} +
	find . -type d -name '.pytest_cache' -exec rm -rf {} +
	find . -type d -name '.ruff_cache' -exec rm -rf {} +
