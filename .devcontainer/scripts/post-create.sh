#!/bin/bash
set -e

# Install powerlevel10k theme
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k"

# Copy dotfiles
cp .devcontainer/dotfiles/.zshrc ~
cp .devcontainer/dotfiles/.p10k.zsh ~
cp .devcontainer/dotfiles/.profile ~
cp .devcontainer/dotfiles/.zprofile ~

echo "✓ Post-create setup complete!"
