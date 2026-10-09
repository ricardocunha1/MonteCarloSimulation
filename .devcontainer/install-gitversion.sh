#!/usr/bin/env bash
# Installs the GitVersion .NET global tool.
# Usage: install-gitversion.sh [version-spec]   (default: 6.8.*, same as CI)
set -euo pipefail

VERSION="${1:-6.8.*}"

if ! command -v dotnet >/dev/null 2>&1; then
    echo "dotnet SDK not found; it is required to install GitVersion." >&2
    exit 1
fi

if dotnet tool list --global | grep -qi '^gitversion\.tool'; then
    dotnet tool update --global GitVersion.Tool --version "$VERSION"
else
    dotnet tool install --global GitVersion.Tool --version "$VERSION"
fi

export PATH="$PATH:$HOME/.dotnet/tools"
echo "Installed: $(dotnet-gitversion /version)"
echo "Next version: run 'dotnet-gitversion /showvariable SemVer' (or 'MajorMinorPatch')"
