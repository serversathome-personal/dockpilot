import { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

export default function Table({ columns, data, onRowClick, defaultSort }) {
  const [sortConfig, setSortConfig] = useState(defaultSort || { key: null, direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig.key) return 0;

    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle array values (e.g., ports) - sort by first public port
    if (Array.isArray(aValue)) {
      const aPort = aValue.find(p => p.PublicPort || p.publicPort);
      aValue = aPort ? (aPort.PublicPort || aPort.publicPort) : 0;
    }
    if (Array.isArray(bValue)) {
      const bPort = bValue.find(p => p.PublicPort || p.publicPort);
      bValue = bPort ? (bPort.PublicPort || bPort.publicPort) : 0;
    }

    // Handle null/undefined values
    if (aValue == null) aValue = '';
    if (bValue == null) bValue = '';

    // Case-insensitive comparison for strings
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <div className="bg-glass-dark backdrop-blur-xl rounded-lg border border-glass-border shadow-glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-glass-border">
          <thead className="bg-glass-darker">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => column.sortable && handleSort(column.key)}
                  className={clsx(
                    'px-2 lg:px-4 py-2 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap',
                    column.sortable && 'cursor-pointer hover:text-white transition-colors'
                  )}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {column.sortable && sortConfig.key === column.key && (
                      <span className="ml-1 lg:ml-2">
                        {sortConfig.direction === 'asc' ? (
                          <ChevronUpIcon className="h-3 w-3 lg:h-4 lg:w-4" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3 lg:h-4 lg:w-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-glass-dark divide-y divide-glass-border">
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-2 lg:px-4 py-8 lg:py-12 text-center text-sm text-slate-400"
                >
                  No data available
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={clsx(
                    'hover:bg-glass-light transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="px-2 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-slate-300 break-words"
                    >
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
