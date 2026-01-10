/**
 * Docker Compose YAML validator
 * Adapted from ComposeToolbox (https://github.com/bluegoosemedia/composetoolbox)
 */

export const validateDockerCompose = (yaml) => {
  const issues = [];
  const lines = yaml.split("\n");

  // Basic YAML syntax validation
  try {
    validateYamlSyntax(yaml, lines, issues);
  } catch (error) {
    issues.push({
      type: "error",
      message: `YAML syntax error: ${error}`,
      line: 1,
    });
  }

  // Docker Compose specific validation
  validateDockerComposeStructure(yaml, lines, issues);
  validateBestPractices(yaml, lines, issues);
  validateVolumeUsage(yaml, lines, issues);

  // Sort issues by priority (errors → warnings → info) then by line number
  const sortedIssues = issues.sort((a, b) => {
    const priorityOrder = { error: 0, warning: 1, info: 2 };
    const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type];

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const aLine = a.line || Number.MAX_SAFE_INTEGER;
    const bLine = b.line || Number.MAX_SAFE_INTEGER;
    return aLine - bLine;
  });

  const hasErrors = sortedIssues.some((issue) => issue.type === "error");
  const hasWarnings = sortedIssues.some((issue) => issue.type === "warning");

  return {
    isValid: !hasErrors,
    issues: sortedIssues,
    hasErrors,
    hasWarnings,
  };
};

function validateYamlSyntax(yaml, lines, issues) {
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    // Check for tabs (YAML doesn't allow tabs)
    if (line.includes("\t")) {
      issues.push({
        type: "error",
        message: "YAML does not allow tabs for indentation. Use spaces instead.",
        line: lineNumber,
        code: "yaml-no-tabs",
      });
    }

    // Check for inconsistent indentation
    if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      const leadingSpaces = line.length - line.trimStart().length;
      if (leadingSpaces % 2 !== 0 && leadingSpaces > 0) {
        issues.push({
          type: "warning",
          message: "Inconsistent indentation. Docker Compose typically uses 2-space indentation.",
          line: lineNumber,
          code: "yaml-indentation",
        });
      }
    }

    // Check for unclosed quotes
    if (trimmed && !trimmed.startsWith("#")) {
      const doubleQuotes = (line.match(/"/g) || []).length;
      const singleQuotes = (line.match(/'/g) || []).length;

      if (doubleQuotes % 2 !== 0) {
        issues.push({
          type: "error",
          message: "Unclosed double quote detected.",
          line: lineNumber,
          code: "yaml-unclosed-quote",
        });
      }

      if (singleQuotes % 2 !== 0) {
        issues.push({
          type: "error",
          message: "Unclosed single quote detected.",
          line: lineNumber,
          code: "yaml-unclosed-quote",
        });
      }
    }

    // Check for missing spaces after colons
    if (trimmed.includes(":") && !trimmed.startsWith("#")) {
      const colonWithoutSpace = /:[^\s]/;
      if (colonWithoutSpace.test(trimmed) && !trimmed.endsWith(":")) {
        const isValidColonUsage =
          trimmed.match(/\w+:\/\//) ||
          trimmed.match(/["']?\d+:\d+/) ||
          trimmed.match(/\d+:\d+\/\w+/) ||
          trimmed.match(/^\s*-\s*["']?[\w.-]+:\d+/) ||
          trimmed.match(/^\s*-\s*["']?[\w.-]+:[\w.-]+/) ||
          (trimmed.match(/\w+:\w+/) && !trimmed.match(/^\s*\w+:\s*$/));

        if (!isValidColonUsage) {
          const yamlKeyPattern = /^\s*[a-zA-Z_][a-zA-Z0-9_-]*:[^\s]/;
          if (yamlKeyPattern.test(line)) {
            issues.push({
              type: "error",
              message: "Missing space after colon in key-value pair.",
              line: lineNumber,
              code: "yaml-missing-space-after-colon",
            });
          }
        }
      }
    }

    // Check for invalid image syntax (trailing colon with no tag)
    if (trimmed.startsWith("image:")) {
      const imageValue = trimmed.substring(6).trim();
      if (imageValue.endsWith(":") && imageValue.length > 1) {
        issues.push({
          type: "error",
          message: "Invalid image syntax: image name cannot end with a colon.",
          line: lineNumber,
          code: "invalid-image-syntax",
        });
      } else if (imageValue === "") {
        issues.push({
          type: "error",
          message: "Image name cannot be empty.",
          line: lineNumber,
          code: "empty-image-name",
        });
      }
    }

    // Check for duplicate keys at the same level
    if (trimmed.includes(":") && !trimmed.startsWith("#")) {
      const key = trimmed.split(":")[0].trim();
      const currentIndent = line.length - line.trimStart().length;

      for (let i = index + 1; i < lines.length; i++) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.length - nextLine.trimStart().length;

        if (nextIndent < currentIndent) break;
        if (nextIndent === currentIndent && nextTrimmed.includes(":")) {
          const nextKey = nextTrimmed.split(":")[0].trim();
          if (key === nextKey) {
            issues.push({
              type: "error",
              message: `Duplicate key "${key}" found.`,
              line: i + 1,
              code: "yaml-duplicate-key",
            });
          }
        }
      }
    }

    // Check for invalid list item syntax
    if (trimmed.startsWith("-") && !trimmed.startsWith("- ") && trimmed.length > 1) {
      issues.push({
        type: "error",
        message: "Invalid list item syntax. List items must have a space after the dash.",
        line: lineNumber,
        code: "yaml-invalid-list-syntax",
      });
    }
  });

  validateOverallStructure(yaml, lines, issues);
}

function validateOverallStructure(yaml, lines, issues) {
  const majorSections = ["version:", "services:", "networks:", "volumes:", "name:"];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    let sectionCount = 0;
    const foundSections = [];

    majorSections.forEach((section) => {
      if (trimmed.includes(section)) {
        sectionCount++;
        foundSections.push(section.replace(":", ""));
      }
    });

    if (sectionCount > 1) {
      issues.push({
        type: "error",
        message: `Multiple YAML sections on same line: ${foundSections.join(", ")}`,
        line: index + 1,
        code: "yaml-multiple-sections-same-line",
      });
    }
  });
}

function validateDockerComposeStructure(yaml, lines, issues) {
  // Check for version field and provide info about it being obsolete
  if (yaml.includes("version:")) {
    const versionLineIndex = lines.findIndex((line) => line.trim().startsWith("version:"));
    if (versionLineIndex !== -1) {
      issues.push({
        type: "info",
        message: "The 'version' field is obsolete in Docker Compose v2. You can safely remove it.",
        line: versionLineIndex + 1,
        code: "compose-version-obsolete",
      });
    }
  }

  // Check for services section
  if (!yaml.includes("services:")) {
    issues.push({
      type: "error",
      message: "Missing required 'services:' section.",
      line: 1,
      code: "compose-missing-services",
    });
    return;
  }

  // Find services section (only top-level ones)
  const servicesLineIndex = lines.findIndex((line) => line.trim() === "services:" && !line.startsWith('  ') && !line.startsWith('\t'));
  if (servicesLineIndex === -1) {
    issues.push({
      type: "error",
      message: "services: section found but not at the top level.",
      line: 1,
      code: "compose-services-not-top-level",
    });
    return;
  }

  // Validate each service
  const serviceNames = [];
  for (let i = servicesLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^[a-zA-Z]/) && !line.startsWith("  ")) break;

    if (line.match(/^ {2}[a-zA-Z][a-zA-Z0-9_-]*:\s*$/)) {
      const serviceName = line.trim().replace(":", "");
      serviceNames.push(serviceName);
      validateService(serviceName, i + 1, lines, issues);
    }
  }

  if (serviceNames.length === 0) {
    issues.push({
      type: "error",
      message: "Services section is empty. At least one service is required.",
      line: servicesLineIndex + 1,
      code: "compose-empty-services",
    });
  }
}

function validateService(serviceName, startLine, lines, issues) {
  let endLine = lines.length;
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].match(/^ {2}[a-zA-Z]/) || lines[i].match(/^[a-zA-Z]/)) {
      endLine = i;
      break;
    }
  }

  const serviceLines = lines.slice(startLine - 1, endLine);
  const serviceConfig = serviceLines.join("\n");

  // Check for image or build
  const hasImage = serviceConfig.includes("image:");
  const hasBuild = serviceConfig.includes("build:");
  if (!hasImage && !hasBuild) {
    issues.push({
      type: "error",
      message: `Service "${serviceName}" must have either "image" or "build" specified.`,
      line: startLine,
      code: "service-missing-image-build",
    });
  }

  // Validate image format if present
  if (hasImage) {
    const imageLineIndex = lines.findIndex(
      (line, index) => index >= startLine - 1 && index < endLine && line.trim().startsWith("image:")
    );
    if (imageLineIndex !== -1) {
      const imageLine = lines[imageLineIndex].trim();
      const imageValue = imageLine.substring(6).trim();

      if (imageValue.endsWith(":") && imageValue.length > 1) {
        issues.push({
          type: "error",
          message: `Service "${serviceName}" has invalid image format: trailing colon without tag.`,
          line: imageLineIndex + 1,
          code: "service-invalid-image-format",
        });
      } else if (imageValue === "") {
        issues.push({
          type: "error",
          message: `Service "${serviceName}" has empty image name.`,
          line: imageLineIndex + 1,
          code: "service-empty-image",
        });
      }
    }
  }

  // Check for restart policy
  if (!serviceConfig.includes("restart:")) {
    issues.push({
      type: "info",
      message: `Service "${serviceName}" has no restart policy. Consider adding "restart: unless-stopped".`,
      line: startLine,
      code: "service-missing-restart",
    });
  }

  // Check for privileged mode
  if (serviceConfig.includes("privileged: true")) {
    const privilegedLineIndex = lines.findIndex(
      (line, index) => index >= startLine - 1 && index < endLine && line.trim().startsWith("privileged:")
    );
    issues.push({
      type: "warning",
      message: `Service "${serviceName}" runs in privileged mode. This may be a security risk.`,
      line: privilegedLineIndex !== -1 ? privilegedLineIndex + 1 : startLine,
      code: "service-privileged-mode",
    });
  }

  // Check for host network mode
  if (serviceConfig.includes("network_mode: host")) {
    const networkModeLineIndex = lines.findIndex(
      (line, index) => index >= startLine - 1 && index < endLine && line.trim().startsWith("network_mode:")
    );
    issues.push({
      type: "warning",
      message: `Service "${serviceName}" uses host networking. This bypasses Docker's network isolation.`,
      line: networkModeLineIndex !== -1 ? networkModeLineIndex + 1 : startLine,
      code: "service-host-network",
    });
  }

  // Validate port mappings
  validatePortMappings(serviceName, serviceConfig, startLine, endLine, lines, issues);
}

function validatePortMappings(serviceName, serviceConfig, startLine, endLine, lines, issues) {
  const portMatches = serviceConfig.match(/^\s*-\s*["']?(\d+):(\d+)["']?/gm);
  if (!portMatches) return;

  const usedPorts = [];

  const portsLineIndex = lines.findIndex(
    (line, index) => index >= startLine - 1 && index < endLine && line.trim() === "ports:"
  );
  const portsLine = portsLineIndex !== -1 ? portsLineIndex + 1 : startLine;

  portMatches.forEach((portMatch) => {
    const match = portMatch.match(/(\d+):(\d+)/);
    if (match) {
      const hostPort = parseInt(match[1]);

      if (usedPorts.includes(hostPort)) {
        issues.push({
          type: "error",
          message: `Service "${serviceName}" has duplicate host port ${hostPort}.`,
          line: portsLine,
          code: "service-duplicate-port",
        });
      }
      usedPorts.push(hostPort);
    }
  });
}

function validateBestPractices(yaml, lines, issues) {
  // Check for latest tags
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("image:") && trimmed.includes(":latest")) {
      issues.push({
        type: "warning",
        message: "Using 'latest' tag is not recommended for production. Use specific version tags.",
        line: index + 1,
        code: "compose-latest-tag",
      });
    }
  });

  // Check for missing health checks
  if (yaml.includes("services:") && !yaml.includes("healthcheck:")) {
    const servicesLineIndex = lines.findIndex((line) => line.trim() === "services:");
    issues.push({
      type: "info",
      message: "No health checks defined. Consider adding health checks for better reliability.",
      line: servicesLineIndex !== -1 ? servicesLineIndex + 1 : 1,
      code: "compose-missing-healthcheck",
    });
  }
}

function validateVolumeUsage(yaml, lines, issues) {
  const definedVolumes = new Set();
  const usedVolumes = new Set();

  const topLevelVolumesSectionIndex = lines.findIndex((line) => {
    return line.trim().startsWith('volumes:') && !line.startsWith('  ') && !line.startsWith('\t');
  });

  if (topLevelVolumesSectionIndex !== -1) {
    for (let i = topLevelVolumesSectionIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() && !line.startsWith('  ') && !line.startsWith('\t')) {
        break;
      }

      const volumeMatch = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
      if (volumeMatch) {
        definedVolumes.add(volumeMatch[1]);
      }
    }
  }

  const servicesSectionIndex = lines.findIndex(line => line.trim() === 'services:');
  if (servicesSectionIndex !== -1) {
    for (let i = servicesSectionIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() && !line.startsWith('  ') && !line.startsWith('\t')) {
        break;
      }

      if (line.trim() === 'volumes:' && (line.startsWith('    ') || line.startsWith('\t\t'))) {
        for (let j = i + 1; j < lines.length; j++) {
          const volumeLine = lines[j];
          if (volumeLine.trim() && !(volumeLine.startsWith('      ') || volumeLine.startsWith('\t\t\t') || volumeLine.startsWith('    - '))) {
            break;
          }

          const volumeEntryMatch = volumeLine.match(/^\s*-\s*(.+)$/);
          if (volumeEntryMatch) {
            const volumeEntry = volumeEntryMatch[1].trim();
            const parts = volumeEntry.split(':');
            if (parts.length >= 2) {
              const volumeSource = parts[0].trim();
              if (!volumeSource.startsWith('./') &&
                  !volumeSource.startsWith('/') &&
                  !volumeSource.includes('\\') &&
                  !volumeSource.match(/^[A-Za-z]:/)) {
                usedVolumes.add(volumeSource);
              }
            }
          }
        }
      }
    }
  }

  // Check for unused defined volumes
  definedVolumes.forEach(volumeName => {
    if (!usedVolumes.has(volumeName)) {
      const volumeLineIndex = lines.findIndex(line =>
        line.trim() === `${volumeName}:` && (line.startsWith('  ') || line.startsWith('\t'))
      );
      issues.push({
        type: "warning",
        message: `Named volume "${volumeName}" is defined but not used by any service.`,
        line: volumeLineIndex !== -1 ? volumeLineIndex + 1 : 1,
        code: "compose-unused-volume",
      });
    }
  });

  // Check for used but undefined volumes
  usedVolumes.forEach(volumeName => {
    if (!definedVolumes.has(volumeName)) {
      const volumeUsageLineIndex = lines.findIndex(line =>
        line.includes(`- ${volumeName}:`) || line.includes(`-${volumeName}:`)
      );
      issues.push({
        type: "error",
        message: `Named volume "${volumeName}" is used but not defined in the volumes section.`,
        line: volumeUsageLineIndex !== -1 ? volumeUsageLineIndex + 1 : 1,
        code: "compose-undefined-volume",
      });
    }
  });
}
