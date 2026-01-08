# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Docker management GUI that combines Dockge's file-based architecture with Portainer's comprehensive feature set. The application runs as a Docker container and manages Docker compose stacks through a modern web interface.

## Core Architecture Principles

### Stack Management (Dockge Architecture)
- Stacks are stored in a `/stacks` directory (configurable via environment variable)
- Each subdirectory in `/stacks` represents one stack
- The folder name equals the stack name
- All stacks must be readable/manageable regardless of how they were created (external interoperability is critical)

### Application Structure
- **Backend**: Containerized application that reads from `/stacks` directory and interfaces with Docker API
- **Frontend**: Modern web UI with dark theme, smoked glass effects, and subtle highlights
- **Deployment**: Runs as a Docker container, built via GitHub Actions and pushed to DockerHub

## UI Navigation Structure

The interface uses vertical navigation tabs:
1. **Dashboard**: Host statistics (CPU, memory, disk, container counts/states, total image size)
2. **Stacks**: Sortable table with stack management (start/restart/stop/edit/delete/create), compose file editor, environment variables, aggregated logs
3. **Containers**: Sortable table with container details (name, parent stack, state, ports), individual container management, resource usage, live logs
4. **Images**: Sortable table with image management (name, tags, size, last update), pull/remove/prune/update actions
5. **Networks**: Sortable table with network details (name, stack, driver, subnet, gateway for IPv4+IPv6), add/remove/prune actions
6. **Volumes**: Sortable table with volume management (name, mount point), remove/prune actions
7. **Updates**: Schedule configuration for automatic/manual updates with stack/container exclusions and major/minor update toggles

## Container States

Support these container states: `running`, `stopped`, `healthy`, `unhealthy`, `exited`, `inactive`

## Key Technical Requirements

- All tables must support column-based sorting
- Log viewing must be real-time/live streaming
- Resource usage displayed at both container and aggregated stack level
- Stack detail view shows aggregated logs from all containers in the stack
- Network detail view shows all containers in the network

## Development Workflow

The application must support:
- Local compilation and testing on development server during development
- GitHub Actions workflow for CI/CD to DockerHub
- README with production-ready docker-compose file for end users

## Design Aesthetic

- Dark theme with smoked glass effects
- Subtle highlights for interactive elements
- Modern minimalist design
- Clean, intuitive interface prioritizing usability
