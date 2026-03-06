# Dev Environment Template

A complete development environment container with Ubuntu 24.04, featuring modern tooling and shell configuration.

## Quick Start

From your project directory, run this exact command:

```bash
curl -fsSL https://raw.githubusercontent.com/akstspace/devcontainer-templates/main/add-environment.sh | bash -s dev-environment
```

This will clone the template repository and copy the dev-environment to your `.devcontainer` folder.

Then in VS Code:
1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Press `Cmd+Shift+P` and select **"Dev Containers: Reopen in Container"**

## What's Included

- **Volta** - Node.js version manager
- **Pyenv** - Python version manager
- **Go**, **Rust/Cargo** - Programming languages
- **gcc/g++** - C/C++ compilers
- **Oh My Zsh** - Zsh shell framework
- **Powerlevel10k** - Modern Zsh theme
- **Shell Plugins** - zsh-autosuggestions, zsh-syntax-highlighting, docker, kubectl, git, and more

