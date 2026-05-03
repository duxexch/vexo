import type { P2PSettingsPanelProps } from './P2PTypes';

export function P2PSettingsPanel({ title, description, children, testId }: P2PSettingsPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid={testId}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}