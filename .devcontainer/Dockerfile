FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install essential development tools
# - curl & wget: for downloading files
# - git: version control
# - sudo: for elevated permissions
# - golang-go: Go programming language
# - cargo: Rust package manager
# - gcc, g++: C/C++ compilers
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    sudo \
    golang-go \
    cargo \
    gcc \
    g++ \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libffi-dev \
    liblzma-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install volta
RUN curl https://get.volta.sh | bash

# Install pyenv
RUN curl https://pyenv.run | bash

# Set the working directory
WORKDIR /workspace
