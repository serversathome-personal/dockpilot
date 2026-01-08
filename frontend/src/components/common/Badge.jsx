import clsx from 'clsx';

const variants = {
  running: 'bg-success/10 text-success border-success/20',
  stopped: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  healthy: 'bg-success/10 text-success border-success/20',
  unhealthy: 'bg-danger/10 text-danger border-danger/20',
  starting: 'bg-warning/10 text-warning border-warning/20',
  exited: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  created: 'bg-primary/10 text-primary border-primary/20',
  restarting: 'bg-warning/10 text-warning border-warning/20',
  removing: 'bg-danger/10 text-danger border-danger/20',
  paused: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  dead: 'bg-danger/10 text-danger border-danger/20',
  default: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm',
        variants[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
