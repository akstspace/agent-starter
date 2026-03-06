FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TEST_MODE=false

WORKDIR /srv

COPY pyproject.toml ./
RUN uv sync --no-dev

COPY app ./app
COPY main.py ./main.py
COPY .env.example ./.env.example

# Create a non-root user to run the application
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Change ownership of the application files to the non-root user
RUN chown -R appuser:appuser /srv

# Switch to the non-root user
USER appuser

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
