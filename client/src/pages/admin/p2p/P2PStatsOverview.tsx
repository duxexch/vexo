import type { P2PStatsOverviewProps } from './P2PTypes';

export function P2PStatsOverview({ stats, testId }: P2PStatsOverviewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid={testId}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
          data-testid={stat.testId}
        >
          <div className="text-sm text-muted-foreground">{stat.label}</div>
          <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
          {stat.hint ? <div className="mt-1 text-xs text-muted-foreground">{stat.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}