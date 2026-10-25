#!/bin/bash

# This script builds the client and server Docker images and pushes them to a
# specified registry. Both images get the same tag. Run it from the repo root.

# Default values
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

CLIENT_IMAGE="planninghub/planninghub-client"
SERVER_IMAGE="planninghub/planninghub-server"
REGISTRY="dev.criticalmanufacturing.io"
NO_PUSH=false

# Help function to display usage information
help() {
    echo "Usage: $0 -t <tag> [-u <username>] [-p <pat>] [-r <registry>] [--client-image <name>] [--server-image <name>] [--no-push]"
    echo "  -t, --tag: The tag for both Docker images"
    echo "  -u, --username: The username for the Docker registry"
    echo "  -p, --pat: The personal access token for the Docker registry"
    echo "  -r, --registry: The Docker registry to push the images to (optional, default: ${REGISTRY})"
    echo "  --client-image: The name of the client image (optional, default: ${CLIENT_IMAGE})"
    echo "  --server-image: The name of the server image (optional, default: ${SERVER_IMAGE})"
    echo "  --no-push: If set, the script will build the images but not push them to the registry (optional)"
}

# Parse command-line arguments
while [ $# -gt 0 ]; do
    case "$1" in
        -u|--username) USERNAME="$2"; shift 2 ;;
        -p|--pat) PAT="$2"; shift 2 ;;
        -t|--tag) TAG="$2"; shift 2 ;;
        --client-image) CLIENT_IMAGE="$2"; shift 2 ;;
        --server-image) SERVER_IMAGE="$2"; shift 2 ;;
        --no-push) NO_PUSH=true; shift ;;
        -r|--registry) REGISTRY="$2"; shift 2 ;;
        -h|--help) help; exit 0 ;;
        *) echo "Unknown option: $1" >&2; help; exit 1 ;;
    esac
done

# Validate required inputs
if [ -z "$TAG" ]; then
    printf "${RED}Error: TAG is required input.${NC}\n" >&2
    help;
    exit 1
fi

# "<image>|<build context>" pairs to build and push; always both, so a release never mixes tiers
TARGETS=("${CLIENT_IMAGE}|src/client" "${SERVER_IMAGE}|src/server")

# Build the Docker images
FULL_IMAGE_NAMES=()
for target in "${TARGETS[@]}"; do
    IMAGE="${target%%|*}"
    CONTEXT="${target#*|}"
    FULL_IMAGE_NAME="${REGISTRY}/${IMAGE}:${TAG}"
    echo "Building Docker image: ${FULL_IMAGE_NAME} (context: ${CONTEXT})"
    docker build -t "${FULL_IMAGE_NAME}" "${CONTEXT}" || { printf "${RED}Error: Failed to build Docker image: ${FULL_IMAGE_NAME}${NC}\n" >&2; exit 1; }
    printf "${GREEN}✅ Docker image built successfully: ${FULL_IMAGE_NAME}${NC}\n"
    FULL_IMAGE_NAMES+=("${FULL_IMAGE_NAME}")
done

# Push the Docker images to the registry if NO_PUSH is not set
if [ "$NO_PUSH" = false ]; then
    if [ -z "$USERNAME" ] || [ -z "$PAT" ]; then
        printf "${RED}Error: USERNAME and PAT are required to push the Docker images.${NC}\n" >&2
        help;
        exit 1
    fi

    # Login to the Docker registry
    echo "Logging in to Docker registry: $REGISTRY"
    echo "$PAT" | docker login "$REGISTRY" -u "$USERNAME" --password-stdin || { printf "${RED}Error: Failed to login to Docker registry.${NC}\n" >&2; exit 1; }
    printf "${GREEN}✅ Logged in to Docker registry successfully.${NC}\n"

    # Push the Docker images
    for FULL_IMAGE_NAME in "${FULL_IMAGE_NAMES[@]}"; do
        docker push "${FULL_IMAGE_NAME}" || { printf "${RED}Error: Failed to push Docker image: ${FULL_IMAGE_NAME}${NC}\n" >&2; exit 1; }
        printf "${GREEN}✅ Docker image pushed successfully: ${FULL_IMAGE_NAME}${NC}\n"
    done
fi
