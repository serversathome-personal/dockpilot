import { forwardRef } from 'react';
import clsx from 'clsx';

const Card = forwardRef(({
  title,
  children,
  className,
  headerAction,
  noPadding = false,
  onClick,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(
        'bg-glass-dark backdrop-blur-xl rounded-lg border border-glass-border shadow-glass',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {title && (
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-6')}>
        {children}
      </div>
    </div>
  );
});

Card.displayName = 'Card';

export default Card;
