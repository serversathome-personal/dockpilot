export default function CircularProgress({ percentage, size = 120, strokeWidth = 8, color = 'text-primary' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // Determine color based on percentage
  let strokeColor = '#3b82f6'; // primary blue
  if (color === 'text-success') {
    strokeColor = '#10b981'; // success green
  } else if (color === 'text-warning') {
    strokeColor = '#f59e0b'; // warning orange
  } else if (color === 'text-danger') {
    strokeColor = '#ef4444'; // danger red
  }

  // Auto-color based on percentage if color is primary
  if (color === 'text-primary') {
    if (percentage >= 90) {
      strokeColor = '#ef4444'; // red
    } else if (percentage >= 75) {
      strokeColor = '#f59e0b'; // orange
    } else if (percentage >= 50) {
      strokeColor = '#eab308'; // yellow
    } else {
      strokeColor = '#10b981'; // green
    }
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Percentage text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}
