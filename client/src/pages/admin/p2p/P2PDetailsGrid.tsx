import type { P2PDetailsGridProps } from './P2PTypes';

export function P2PDetailsGrid({ items, testId }: P2PDetailsGridProps) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid={testId}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-card p-4" data-testid={item.testId}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}