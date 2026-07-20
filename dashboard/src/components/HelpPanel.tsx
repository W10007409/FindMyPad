import type { ReactNode } from 'react';

export function HelpPanel({ title, children, defaultOpen }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="mb-3 rounded border bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/50">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">{children}</div>
    </details>
  );
}
