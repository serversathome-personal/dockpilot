import { useState, useEffect, useMemo } from 'react';
import { validateDockerCompose } from '../../utils/composeValidator';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

export default function ComposeValidation({ yaml, onGoToLine }) {
  const [showDetails, setShowDetails] = useState(false);

  const validation = useMemo(() => {
    if (!yaml || yaml.trim() === '') {
      return { isValid: true, issues: [], hasErrors: false, hasWarnings: false };
    }
    return validateDockerCompose(yaml);
  }, [yaml]);

  const errorCount = validation.issues.filter((issue) => issue.type === 'error').length;
  const warningCount = validation.issues.filter((issue) => issue.type === 'warning').length;
  const infoCount = validation.issues.filter((issue) => issue.type === 'info').length;

  const getStatusIcon = () => {
    if (validation.hasErrors) {
      return <XCircleIcon className="w-5 h-5 text-danger" />;
    } else if (validation.hasWarnings) {
      return <ExclamationTriangleIcon className="w-5 h-5 text-warning" />;
    } else {
      return <CheckCircleIcon className="w-5 h-5 text-success" />;
    }
  };

  const getStatusText = () => {
    if (validation.hasErrors) {
      return 'Invalid Configuration';
    } else if (validation.hasWarnings) {
      return 'Valid with Warnings';
    } else {
      return 'Valid Configuration';
    }
  };

  const getStatusColor = () => {
    if (validation.hasErrors) {
      return 'text-danger';
    } else if (validation.hasWarnings) {
      return 'text-warning';
    } else {
      return 'text-success';
    }
  };

  const getIssueIcon = (type) => {
    switch (type) {
      case 'error':
        return <XCircleIcon className="w-4 h-4 text-danger flex-shrink-0" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-4 h-4 text-warning flex-shrink-0" />;
      default:
        return <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0" />;
    }
  };

  const getIssueBgColor = (type) => {
    switch (type) {
      case 'error':
        return 'bg-danger/10 border-danger/30';
      case 'warning':
        return 'bg-warning/10 border-warning/30';
      default:
        return 'bg-primary/10 border-primary/30';
    }
  };

  if (!yaml || yaml.trim() === '') {
    return null;
  }

  return (
    <div className="bg-glass-dark rounded-lg border border-glass-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => validation.issues.length > 0 && setShowDetails(!showDetails)}
      >
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className={`font-medium text-sm ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-danger/20 text-danger">
              {errorCount} Error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-warning/20 text-warning">
              {warningCount} Warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
          {infoCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-primary/20 text-primary">
              {infoCount} Suggestion{infoCount !== 1 ? 's' : ''}
            </span>
          )}
          {validation.issues.length > 0 && (
            showDetails ? (
              <ChevronUpIcon className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDownIcon className="w-4 h-4 text-slate-400" />
            )
          )}
        </div>
      </div>

      {/* Issue Details */}
      {showDetails && validation.issues.length > 0 && (
        <div className="border-t border-glass-border px-3 py-2 space-y-2 max-h-60 overflow-y-auto">
          {validation.issues.map((issue, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 p-2 rounded border ${getIssueBgColor(issue.type)}`}
            >
              {getIssueIcon(issue.type)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white">
                  {issue.line && (
                    <span className="text-slate-400 mr-1">Line {issue.line}:</span>
                  )}
                  {issue.message}
                </p>
              </div>
              {issue.line && onGoToLine && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToLine(issue.line);
                  }}
                  className="px-2 py-0.5 text-xs text-primary hover:text-primary-light hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                  title="Go to line"
                >
                  Go to
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
