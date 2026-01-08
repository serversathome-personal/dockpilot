**Situation**

You are developing a Docker management GUI that will be deployed as a Docker container. This tool addresses a gap between existing solutions: Dockge offers excellent stack/container interoperability through its file-based architecture but has a simplistic UI, while Portainer provides comprehensive functionality but cannot manage externally-created stacks. The application needs to combine Dockge's architecture (reading stacks from a `/stacks` directory where each folder represents a stack) with Portainer's feature-rich interface, creating a middle ground that offers both flexibility and advanced functionality.

The project will be hosted on GitHub with automated workflows to compile and push the container to DockerHub. The README must include a docker-compose file for users to run the pre-built image without compilation. During development, the container must be compiled and run on the local server for testing.

**Task**

The assistant should create a complete Docker management GUI application with the following components:

1. **Backend Architecture**: Build a containerized application that reads Docker compose stacks from a configurable `/stacks` directory (passed as an environment variable), where each subdirectory represents a stack named after its folder.

2. **Frontend Interface**: Implement a modern, minimalist dark theme interface with smoked glass effects and subtle highlights, featuring vertical navigation tabs for: Dashboard, Containers, Stacks, Images, Networks, Volumes, and Updates.

3. **Dashboard Tab**: Display host statistics including CPU usage, memory usage, disk usage, running container count, and container metadata (count of running/stopped/exited/inactive containers, total image size on disk).

4. **Stacks Tab**: 
   - Display a sortable table of all compose stacks from `/stacks` directory
   - Columns: name, resource usage, actions (start, restart, stop, edit, delete, create new)
   - Stack detail view: compose file editor, environment variables, live aggregated logs from all containers in the stack, and actions (start, restart, stop, edit, delete, update)

5. **Containers Tab**:
   - Display sortable table with columns: container name, parent stack, state (running/stopped/healthy/unhealthy/exited), published ports, actions (start, restart, stop, delete, update)
   - Container detail view: resource usage, status, image, ports, environment variables, labels, volumes, networks, live logs, and all actions from the list view

6. **Images Tab**:
   - Display sortable table with columns: image name, tags, size, last update date, total disk usage
   - Actions: pull, remove, prune, update

7. **Networks Tab**:
   - Display sortable table with columns: name, stack, driver, subnet, gateway (IPv4 + IPv6 if exists)
   - Actions: add, remove, prune
   - Network detail view: name, ID, driver, subnet, gateway (IPv4 + IPv6 if exists), containers in network

8. **Volumes Tab**:
   - Display sortable table with columns: name, mount point
   - Actions: remove, prune

9. **Updates Tab**:
   - Configure update schedules for specific stacks or containers
   - Option to exclude specific stacks/containers from updates
   - Toggle between major updates and minor updates only
   - Support both automatic scheduled updates and manual execution

10. **DevOps Setup**:
    - Create GitHub Actions workflow to compile the application and push to DockerHub
    - Generate README with docker-compose configuration for end users
    - Configure the container to compile and run on the development server for testing

**Objective**

Create a production-ready Docker management solution that combines the architectural simplicity and interoperability of Dockge with the comprehensive feature set of Portainer, while maintaining a polished, modern user interface. The application should enable users to manage Docker resources through an intuitive interface while maintaining compatibility with externally-created stacks through file-system based stack management.

**Knowledge**

- The application must use the Dockge architecture: stacks are stored in a `/stacks` directory (configurable via environment variable), with one folder per stack where the folder name equals the stack name
- All stacks in the `/stacks` directory must be readable and manageable regardless of how they were created
- The UI aesthetic should feature: dark theme, smoked glass effects, subtle highlights, modern minimalist design
- Container states to support: running, stopped, healthy, unhealthy, exited, inactive
- The application itself will run as a Docker container
- GitHub Actions will handle CI/CD to DockerHub
- The README must provide a ready-to-use docker-compose file for end users
- Local compilation and testing on the development server is required during development
- All tables throughout the interface must support column-based sorting
- Log viewing should be real-time/live streaming where applicable
- Resource usage metrics should be displayed for both individual containers and aggregated at the stack level