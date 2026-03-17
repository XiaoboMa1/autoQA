#!/bin/bash
# Integrates installation, build, deployment, and maintenance functions
# 
# Usage:
#   ./autoqa.sh install     - Initial installation
#   ./autoqa.sh build       - Build image (with cache, daily dev: fast build test)
#   ./autoqa.sh push        - Push image
#   ./autoqa.sh rebuild     - Rebuild without cache (no cache, release version: full rebuild)
#   ./autoqa.sh upgrade     - Upgrade to latest version
#   ./autoqa.sh start       - Start service
#   ./autoqa.sh stop        - Stop service
#   ./autoqa.sh restart     - Restart service
#   ./autoqa.sh status      - View status
#   ./autoqa.sh logs        - View logs
#   ./autoqa.sh backup      - Backup database
#   ./autoqa.sh restore     - Restore database
#   ./autoqa.sh clean       - Clean all data

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load unified configuration
if [ -f "${SCRIPT_DIR}/config.sh" ]; then
    source "${SCRIPT_DIR}/config.sh"
fi

# Configuration file paths
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO] $1${NC}"; }
log_success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
log_warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }
log_error() { echo -e "${RED}[ERROR] $1${NC}"; }

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() { echo -e "${BLUE}[STEP] $1${NC}"; }
print_success() { echo -e "${GREEN}[OK] $1${NC}"; }
print_warning() { echo -e "${YELLOW}[WARN] $1${NC}"; }
print_error() { echo -e "${RED}[FAIL] $1${NC}"; }

# Check Docker environment
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        echo "Install command: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is not installed."
        exit 1
    fi
    
    log_success "Docker environment check passed."
}

# Convert Windows line endings
convert_line_endings() {
    local file="$1"
    if [ -f "$file" ] && grep -q $'\r' "$file" 2>/dev/null; then
        log_warning "Windows line endings detected, converting: $file"
        sed -i 's/\r$//' "$file"
    fi
}

# Check environment variables
check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$ENV_EXAMPLE" ]; then
            log_warning ".env file does not exist, creating from example file..."
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            log_warning "Please edit $ENV_FILE to configure necessary environment variables."
            exit 1
        else
            log_error "Neither .env file nor example file exists."
            exit 1
        fi
    fi
    
    convert_line_endings "$ENV_FILE"
    
    set -a
    source "$ENV_FILE"
    set +a
    
    local missing_vars=()
    [ -z "$MYSQL_ROOT_PASSWORD" ] && missing_vars+=("MYSQL_ROOT_PASSWORD")
    [ -z "$DB_PASSWORD" ] && missing_vars+=("DB_PASSWORD")
    [ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing necessary environment variables: ${missing_vars[*]}"
        log_info "Please edit $ENV_FILE to configure these variables."
        exit 1
    fi
    
    log_success "Environment variables check passed."
}

# ============================================
# Command: install - Initial installation
# ============================================
cmd_install() {
    print_header "[INSTALL] Initial autoqa AI installation"
    
    check_docker
    check_env
    
    log_info "Creating data directories..."
    mkdir -p "$SCRIPT_DIR/uploads" "$SCRIPT_DIR/artifacts" "$SCRIPT_DIR/screenshots" "$SCRIPT_DIR/logs" "$SCRIPT_DIR/mysql-init"
    
    log_info "Building Docker images..."
    docker compose -f "$COMPOSE_FILE" build
    
    log_info "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_info "Waiting for services to be ready..."
    sleep 10
    
    log_success "Installation completed!"
    echo ""
    echo "Tips:"
    echo "   - Database migration executes automatically on application startup."
    echo "   - First startup may take 1-2 minutes."
    echo "   - Run './autoqa.sh logs' to view startup logs."
    echo ""
    cmd_status
    
    echo ""
    log_info "Access URL: http://localhost:5173"
    log_info "API URL: http://localhost:3001"
}

# ============================================
# Command: build - Build image (using cache)
# ============================================
cmd_build() {
    local VERSION="${1:-latest}"
    local FULL_IMAGE=$(get_remote_image "$VERSION")
    
    # Ensure in project root directory
    cd "$SCRIPT_DIR" || exit 1
    
    print_header "[BUILD] Build autoqa AI Docker image (using cache)"
    echo "Local image: ${LOCAL_IMAGE}"
    echo "Remote image: ${FULL_IMAGE}"
    echo "Version tag: ${VERSION}"
    echo ""
    
    # Phase 1: Environment check
    print_header "[1/4] Environment check"
    
    print_step "Checking required files"
    local files=("package.json" "package-lock.json" "prisma/schema.prisma" ".env.example" "Dockerfile.debian")
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "Missing file: $file"
            exit 1
        fi
    done
    print_success "Required files check passed"
    
    print_step "Checking development environment"
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null || ! command -v docker &> /dev/null; then
        print_error "Missing necessary development tools"
        exit 1
    fi
    print_success "Development environment check passed"
    
    # Phase 2: Fix common issues
    print_header "[2/4] Fix common issues"
    
    print_step "Checking Prisma client"
    if [ ! -d "src/generated/prisma" ] || [ ! -f "src/generated/prisma/index.js" ]; then
        print_warning "Prisma client not generated, regenerating..."
        rm -rf src/generated/prisma 2>/dev/null || true
        npx prisma generate
        print_success "Prisma client regenerated successfully"
    else
        print_success "Prisma client already exists"
    fi
    
    print_step "Cleaning build cache"
    rm -rf dist node_modules/.vite 2>/dev/null || true
    print_success "Build cache cleaned"
    
    # Phase 3: Build validation
    print_header "[3/4] Build validation"
    
    print_step "Building frontend..."
    if npm run build > /tmp/build-check.log 2>&1; then
        print_success "Frontend build successful"
        rm -rf dist
    else
        print_error "Frontend build failed"
        tail -30 /tmp/build-check.log
        exit 1
    fi
    
    # Phase 4: Docker image build
    print_header "[4/4] Docker image build (using cache)"
    
    print_step "Starting Docker image build..."
    echo "Tip: For full rebuild, use: ./autoqa.sh rebuild"
    echo ""
    
    if docker build \
        -f "Dockerfile.debian" \
        -t "${LOCAL_IMAGE}" \
        -t "${FULL_IMAGE}" \
        . 2>&1 | tee /tmp/docker-build.log; then
        print_success "Docker image build successful"
    else
        print_error "Docker image build failed"
        tail -50 /tmp/docker-build.log
        exit 1
    fi
    
    IMAGE_SIZE=$(docker images "${LOCAL_IMAGE}" --format "{{.Size}}")
    echo "  Image size: ${IMAGE_SIZE}"
    
    print_header "[DONE] Build completed"
    echo "Local image: ${LOCAL_IMAGE}"
    echo "Remote image: ${FULL_IMAGE}"
    echo "Image size: ${IMAGE_SIZE}"
    echo ""
    echo "Next steps:"
    echo "  Local test: docker run --rm -p 5173:5173 -p 3001:3001 ${LOCAL_IMAGE}"
    echo "  Push image: ./autoqa.sh push ${VERSION}"
    echo "  Deploy service: ./autoqa.sh start"
}

# ============================================
# Command: push - Push image to Aliyun
# ============================================
cmd_push() {
    local VERSION="${1:-latest}"
    local FULL_IMAGE=$(get_remote_image "$VERSION")
    
    print_header "[PUSH] Push image to Aliyun"
    echo "Local image: ${LOCAL_IMAGE}"
    echo "Remote image: ${FULL_IMAGE}"
    echo "Version tag: ${VERSION}"
    echo ""
    
    # Check if local image exists
    print_step "Checking local image..."
    IMAGE_ID=$(docker images "${LOCAL_IMAGE}" --format "{{.ID}}" | head -1)
    IMAGE_SIZE=$(docker images "${LOCAL_IMAGE}" --format "{{.Size}}" | head -1)
    
    if [ -z "$IMAGE_ID" ]; then
        print_error "Local image does not exist: ${LOCAL_IMAGE}"
        echo "Please build image first: ./autoqa.sh build ${VERSION}"
        echo ""
        echo "Currently available images:"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" | head -10
        exit 1
    fi
    print_success "Local image exists"
    echo "  Image ID: ${IMAGE_ID}"
    echo "  Image size: ${IMAGE_SIZE}"
    echo ""
    
    # Check if remote tag exists, create if not
    print_step "Checking remote tags..."
    if ! docker images "${FULL_IMAGE}" --format "{{.ID}}" | grep -q "${IMAGE_ID}"; then
        print_warning "Remote tag does not exist, creating..."
        if docker tag ${IMAGE_ID} ${FULL_IMAGE}; then
            print_success "Image tag created: ${FULL_IMAGE}"
        else
            print_error "Failed to tag image"
            exit 1
        fi
    else
        print_success "Remote tag already exists"
    fi
    echo ""
    
    # Check login status
    print_step "Checking Docker login status..."
    if ! docker info 2>/dev/null | grep -q "Username"; then
        print_warning "Not logged into Docker, attempting login..."
        echo "Login URL: ${DOCKER_REGISTRY}"
        if ! docker login ${DOCKER_REGISTRY}; then
            print_error "Docker login failed"
            exit 1
        fi
    fi
    print_success "Docker is logged in"
    echo ""
    
    # Push image
    print_step "Pushing image to Aliyun..."
    echo "This may take a few minutes, please wait..."
    echo ""
    if docker push ${FULL_IMAGE}; then
        print_success "Image pushed successfully"
    else
        print_error "Image push failed"
        exit 1
    fi
    
    print_header "[DONE] Push completed"
    echo "Image URL: ${FULL_IMAGE}"
    echo "Image ID: ${IMAGE_ID}"
    echo "Image size: ${IMAGE_SIZE}"
    echo "Version tag: ${VERSION}"
    echo ""
    echo "Deployment commands:"
    echo "  docker pull ${FULL_IMAGE}"
    echo "  docker compose -f docker-compose.yml up -d"
}

# ============================================
# Command: rebuild - Rebuild without cache
# ============================================
cmd_rebuild() {
    # Ensure in project root directory
    cd "$SCRIPT_DIR" || exit 1
    
    print_header "[REBUILD] Rebuild autoqa AI without cache"
    
    print_step "Stopping and removing old containers..."
    docker stop autoqa-ai-app 2>/dev/null || echo "Container not running"
    docker rm autoqa-ai-app 2>/dev/null || echo "Container does not exist"
    
    print_step "Removing old images..."
    docker rmi ${LOCAL_IMAGE} 2>/dev/null || echo "Local image does not exist"
    docker rmi $(get_remote_image "latest") 2>/dev/null || echo "Remote image does not exist"
    
    print_step "Cleaning Docker build cache..."
    docker builder prune -f
    
    print_step "Starting nocache build (this may take 10-20 minutes)..."
    docker build \
        --no-cache \
        -f "Dockerfile.debian" \
        -t "${LOCAL_IMAGE}" \
        -t "$(get_remote_image 'latest')" \
        .
    
    print_success "Rebuild completed!"
    echo ""
    echo "Image size: $(docker images ${LOCAL_IMAGE} --format '{{.Size}}')"
    echo ""
    echo "Next steps:"
    echo "  Start service: ./autoqa.sh start"
    echo "  Push image: docker push $(get_remote_image 'latest')"
}

# ============================================
# Command: upgrade - Upgrade
# ============================================
cmd_upgrade() {
    print_header "[UPGRADE] Upgrade autoqa AI"
    
    check_docker
    check_env
    
    cmd_backup
    
    if [ -d "$SCRIPT_DIR/.git" ]; then
        log_info "Pulling latest code..."
        cd "$SCRIPT_DIR" && git pull origin dev
    fi
    
    log_info "Rebuilding images..."
    docker compose -f "$COMPOSE_FILE" build autoqa-ai
    
    log_info "Restarting services..."
    docker compose -f "$COMPOSE_FILE" up -d autoqa-ai
    
    log_info "Executing database migration..."
    docker compose -f "$COMPOSE_FILE" exec -T autoqa-ai npx prisma migrate deploy || true
    
    log_info "Cleaning old images..."
    docker image prune -f
    
    log_success "Upgrade completed!"
    cmd_status
}

# ============================================
# Command: start/stop/restart/status
# ============================================
cmd_start() {
    log_info "Starting autoqa AI services..."
    check_env
    docker compose -f "$COMPOSE_FILE" up -d
    log_success "Services started"
    cmd_status
}

cmd_stop() {
    log_info "Stopping autoqa AI services..."
    docker compose -f "$COMPOSE_FILE" down
    log_success "Services stopped"
}

cmd_restart() {
    log_info "Restarting autoqa AI services..."
    cmd_stop
    cmd_start
}

cmd_status() {
    log_info "Service status:"
    docker compose -f "$COMPOSE_FILE" ps
}

# ============================================
# Command: logs - View logs
# ============================================
cmd_logs() {
    local service="${1:-autoqa-ai}"
    log_info "Viewing $service logs..."
    docker compose -f "$COMPOSE_FILE" logs -f "$service"
}

# ============================================
# Command: backup - Backup database
# ============================================
cmd_backup() {
    check_env
    
    local backup_dir="$SCRIPT_DIR/backups"
    local backup_file="$backup_dir/autoqa_ai_$(date +%Y%m%d_%H%M%S).sql"
    
    mkdir -p "$backup_dir"
    
    log_info "Backing up database to $backup_file..."
    
    if docker compose -f "$COMPOSE_FILE" exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" autoqa_ai > "$backup_file" 2>/dev/null; then
        log_success "Database backup successful: $backup_file"
    else
        log_warning "Database backup skipped (service may not be running)"
    fi
}

# ============================================
# Command: restore - Restore database
# ============================================
cmd_restore() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Please specify backup file path"
        echo "Usage: $0 restore <backup_file.sql>"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file does not exist: $backup_file"
        exit 1
    fi
    
    check_env
    
    log_warning "[WARNING] About to restore database, this will overwrite existing data!"
    read -p "Confirm to continue? (y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "Operation cancelled"
        exit 0
    fi
    
    log_info "Restoring database..."
    docker compose -f "$COMPOSE_FILE" exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" autoqa_ai < "$backup_file"
    log_success "Database restored successfully"
}

# ============================================
# Command: clean - Clean all data
# ============================================
cmd_clean() {
    log_warning "[WARNING] About to delete all containers, images, and volumes!"
    read -p "Confirm to continue? (y/N): " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "Operation cancelled"
        exit 0
    fi
    
    log_info "Cleaning all resources..."
    docker compose -f "$COMPOSE_FILE" down -v --rmi all
    log_success "Clean completed"
}

# ============================================
# Command: diagnose - Diagnose MySQL startup issues
# ============================================
cmd_diagnose() {
    print_header "[DIAGNOSE] MySQL startup failure troubleshooting"
    
    # 1. Check environment variables
    print_step "[1/6] Check environment variables"
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        
        if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
            print_error "MYSQL_ROOT_PASSWORD is not set"
        else
            print_success "MYSQL_ROOT_PASSWORD is set"
        fi
        
        if [ -z "$DB_PASSWORD" ]; then
            print_error "DB_PASSWORD is not set"
        else
            print_success "DB_PASSWORD is set"
        fi
    else
        print_error ".env file does not exist: $ENV_FILE"
    fi
    echo ""
    
    # 2. Check port usage
    print_step "[2/6] Check port usage"
    if netstat -tuln 2>/dev/null | grep -q ":3306 "; then
        print_warning "Port 3306 is already in use"
        echo "Occupying process:"
        netstat -tulnp 2>/dev/null | grep ":3306 " || lsof -i :3306 2>/dev/null || echo "Cannot get process info"
    else
        print_success "Port 3306 is not in use"
    fi
    echo ""
    
    # 3. Check Docker resources
    print_step "[3/6] Check Docker resources"
    docker system df
    echo ""
    
    # 4. View container status
    print_step "[4/6] View container status"
    docker compose -f "$COMPOSE_FILE" ps -a
    echo ""
    
    # 5. View MySQL container logs
    print_step "[5/6] View MySQL container logs (last 50 lines)"
    if docker ps -a | grep -q autoqa-ai-mysql; then
        docker logs --tail 50 autoqa-ai-mysql 2>&1 || echo "Cannot get logs"
    else
        print_warning "MySQL container does not exist"
    fi
    echo ""
    
    # 6. Check data volumes
    print_step "[6/6] Check data volumes"
    docker volume ls | grep mysql-data || echo "mysql-data volume does not exist"
    if docker volume inspect debianlinux_mysql-data >/dev/null 2>&1; then
        echo "Data volume info:"
        docker volume inspect debianlinux_mysql-data | grep -E "(Name|Mountpoint|CreatedAt)" || docker volume inspect debianlinux_mysql-data
    fi
    echo ""
    
    # Suggested solutions
    print_header "[SOLUTIONS] Common solutions"
    echo ""
    echo "1. Clean and restart:"
    echo "   ./autoqa.sh clean"
    echo "   ./autoqa.sh install"
    echo ""
    echo "2. If port is occupied, stop process or modify port:"
    echo "   # Modify port mapping in docker-compose.yml"
    echo "   ports:"
    echo "     - \"3307:3306\"  # Use port 3307 instead"
    echo ""
    echo "3. If permission issue, clean data volume:"
    echo "   docker volume rm debianlinux_mysql-data"
    echo "   ./autoqa.sh install"
    echo ""
    echo "4. If out of memory, increase Docker memory limit or use MySQL 5.7:"
    echo "   # Modify docker-compose.yml"
    echo "   image: mysql:5.7  # Use MySQL 5.7 instead"
    echo ""
    echo "5. View full logs:"
    echo "   docker logs autoqa-ai-mysql"
    echo ""
}

# ============================================
# Command: help - Help info
# ============================================
cmd_help() {
    cat << EOF
autoqa AI Docker Unified Management Script

Usage: $0 <command> [arguments]

[INSTALLATION AND DEPLOYMENT]:
  install         Initial autoqa AI installation
  build [version] Build image (using cache, default: latest)
  push [version]  Push image to Aliyun (default: latest)
  rebuild         Full image rebuild without cache
  upgrade         Upgrade to the latest version

[SERVICE MANAGEMENT]:
  start           Start services
  stop            Stop services
  restart         Restart services
  status          View service status
  logs [service]  View logs (default: autoqa-ai)

[DATA MANAGEMENT]:
  backup          Backup database
  restore <file>  Restore database
  clean           Clean all data (Danger)

[OTHER]:
  help            Show this help message
  diagnose        Diagnose MySQL startup issues

Examples:
  $0 install              # Initial installation
  $0 build v1.0.0         # Build version v1.0.0 (using cache, fast)
  $0 push v1.0.0          # Push version v1.0.0 to Aliyun
  $0 rebuild              # Full rebuild without cache (ensure latest)
  $0 logs mysql           # View MySQL logs
  $0 restore backup.sql   # Restore database

EOF
}

# ============================================
# Main entry
# ============================================
case "${1:-help}" in
    install)    cmd_install ;;
    build)      cmd_build "$2" ;;
    push)       cmd_push "$2" ;;
    rebuild)    cmd_rebuild ;;
    upgrade)    cmd_upgrade ;;
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    restart)    cmd_restart ;;
    status)     cmd_status ;;
    logs)       cmd_logs "$2" ;;
    backup)     cmd_backup ;;
    restore)    cmd_restore "$2" ;;
    clean)      cmd_clean ;;
    diagnose)   cmd_diagnose ;;
    help|*)     cmd_help ;;
esac