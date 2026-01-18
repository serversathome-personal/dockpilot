import {
  ArrowDownTrayIcon,
  PlusCircleIcon,
  PlayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

const DEPLOY_PHASES = [
  { id: 'pulling', label: 'Pulling', icon: ArrowDownTrayIcon },
  { id: 'creating', label: 'Creating', icon: PlusCircleIcon },
  { id: 'starting', label: 'Starting', icon: PlayIcon },
  { id: 'running', label: 'Running', icon: CheckCircleIcon },
  { id: 'logs', label: 'Logs', icon: DocumentTextIcon },
];

/**
 * Detects the current deploy phase from compose output
 * @param {string} output - The compose output text
 * @returns {string|null} The detected phase or null
 */
export function detectDeployPhase(output) {
  if (!output) return null;
  const lowerOutput = output.toLowerCase();

  if (lowerOutput.includes('pulling') || lowerOutput.includes('downloading') || lowerOutput.includes('pull complete')) {
    return 'pulling';
  }
  if (lowerOutput.includes('creating') || lowerOutput.includes('created')) {
    return 'creating';
  }
  if (lowerOutput.includes('starting') || lowerOutput.includes('started')) {
    return 'starting';
  }
  if (lowerOutput.includes('running') || lowerOutput.includes('done') || lowerOutput.includes('up-to-date')) {
    return 'running';
  }
  return null;
}

/**
 * Visual stepper component showing deployment progress
 * @param {Object} props
 * @param {string} props.currentPhase - Current phase: 'pulling' | 'creating' | 'starting' | 'running' | 'logs'
 * @param {boolean} props.showLogs - Whether we're in the logs phase
 */
export default function DeployProgress({ currentPhase, showLogs = false }) {
  // Determine the active phase - if showLogs is true, we're in logs phase
  const activePhase = showLogs ? 'logs' : currentPhase;

  // Get the index of current phase
  const currentIndex = DEPLOY_PHASES.findIndex(p => p.id === activePhase);

  return (
    <div className="flex items-center justify-between w-full py-3 px-2">
      {DEPLOY_PHASES.map((phase, index) => {
        const Icon = phase.icon;
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <div key={phase.id} className="flex items-center flex-1">
            {/* Step circle and icon */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300
                  ${isComplete ? 'bg-success border-success text-white' : ''}
                  ${isCurrent ? 'border-primary bg-primary/20 text-primary animate-pulse' : ''}
                  ${isPending ? 'border-slate-600 bg-slate-800/50 text-slate-500' : ''}
                `}
              >
                {isComplete ? (
                  <CheckCircleIcon className="w-6 h-6" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}

                {/* Pulse animation ring for current step */}
                {isCurrent && (
                  <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />
                )}
              </div>

              {/* Label */}
              <span
                className={`
                  mt-2 text-xs font-medium transition-colors
                  ${isComplete ? 'text-success' : ''}
                  ${isCurrent ? 'text-primary' : ''}
                  ${isPending ? 'text-slate-500' : ''}
                `}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector line (except for last item) */}
            {index < DEPLOY_PHASES.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-2 transition-colors duration-300
                  ${index < currentIndex ? 'bg-success' : 'bg-slate-700'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
