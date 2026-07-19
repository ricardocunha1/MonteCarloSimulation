#!/bin/bash

# This script builds and pushes a Docker image to a specified registry.

# Default values
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

IMAGE="montecarlosim/montecarlo-sim"
REGISTRY="dev.criticalmanufacturing.io"
NO_PUSH=false

# Help function to display usage information
help() {
    echo "Usage: $0 -t <tag> [-u <username>] [-p <pat>] [-i <image-name>] [--no-push] [-r <registry>]"
    echo "  -t, --tag: The tag for the Docker image"
    echo "  -u, --username: The username for the Docker registry"
    echo "  -p, --pat: The personal access token for the Docker registry"
    echo "  -i, --image-name: The name of the Docker image to build and push (optional)"
    echo "  --no-push: If set, the script will build the image but not push it to the registry (optional)"
    echo "  -r, --registry: The Docker registry to push the image to (optional)"
}

# Parse command-line arguments
while [ $# -gt 0 ]; do
    case "$1" in
        -u|--username) USERNAME="$2"; shift 2 ;;
        -p|--pat) PAT="$2"; shift 2 ;;
        -t|--tag) TAG="$2"; shift 2 ;;
        -i|--image-name) IMAGE="$2"; shift 2 ;;
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

# Build the Docker image
FULL_IMAGE_NAME="${REGISTRY}/${IMAGE}:${TAG}"
echo "Building Docker image: ${FULL_IMAGE_NAME}"
docker build -t "${FULL_IMAGE_NAME}" . || { printf "${RED}Error: Failed to build Docker image.${NC}\n" >&2; exit 1; }
printf "${GREEN}✅ Docker image built successfully: ${FULL_IMAGE_NAME}${NC}\n"

# Push the Docker image to the registry if NO_PUSH is not set
if [ "$NO_PUSH" = false ]; then
    if [ -z "$USERNAME" ] || [ -z "$PAT" ]; then
        printf "${RED}Error: USERNAME and PAT are required to push the Docker image.${NC}\n" >&2
        help;
        exit 1
    fi

    # Login to the Docker registry
    echo "Logging in to Docker registry: $REGISTRY"
    docker login "$REGISTRY" -u "$USERNAME" -p "$PAT" || { printf "${RED}Error: Failed to login to Docker registry.${NC}\n" >&2; exit 1; } 
    printf "${GREEN}✅ Logged in to Docker registry successfully.${NC}\n"

    # Push the Docker image
    docker push "${FULL_IMAGE_NAME}" || { printf "${RED}Error: Failed to push Docker image.${NC}\n" >&2; exit 1; }
    printf "${GREEN}✅ Docker image pushed successfully: ${FULL_IMAGE_NAME}${NC}\n"
fi