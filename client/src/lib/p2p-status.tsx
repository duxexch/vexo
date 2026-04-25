import { type ComponentType } from "react";
import { Activity, Ban, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type P2PStatusBucket = "pending" | "active" | "resolved" | "cancelled";

export function getOfferStatusBucket(status: string): P2PStatusBucket {
  switch (status) {
    case "active":
      return "active";
    case "completed":
      return "resolved";
    case "rejected":
    case "cancelled":
      return "cancelled";
    case "pending_approval":
    case "paused":
    case "inactive":
      return "pending";
    default:
      return "pending";
  }
}

export function getTradeStatusBucket(status: string): P2PStatusBucket {
  switch (status) {
    case "pending":
      return "pending";
    case "paid":
    case "confirmed":
    case "disputed":
      return "active";
    case "completed":
      return "resolved";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

export function getDisputeStatusBucket(status: string): P2PStatusBucket {
  switch (status) {
    case "open":
    case "investigating":
      return "active";
    case "resolved":
    case "closed":
      return "resolved";
    default:
      return "pending";
  }
}

const BUCKET_META: Record<
  P2PStatusBucket,
  {
    icon: ComponentType<{ className?: string }>;
    pillClass: string;
    iconClass: string;
  }
> = {
  pending: {
    icon: Clock,
    pillClass: "border-amber-600/40 bg-amber-600/10 text-amber-300",
    iconClass: "text-amber-400",
  },
  active: {
    icon: Activity,
    pillClass: "border-sky-600/40 bg-sky-600/10 text-sky-300",
    iconClass: "text-sky-400",
  },
  resolved: {
    icon: CheckCircle2,
    pillClass: "border-emerald-600/40 bg-emerald-600/10 text-emerald-300",
    iconClass: "text-emerald-400",
  },
  cancelled: {
    icon: Ban,
    pillClass: "border-red-600/40 bg-red-600/10 text-red-300",
    iconClass: "text-red-400",
  },
};

export interface StatusPillProps {
  bucket: P2PStatusBucket;
  bucketLabel: string;
  preciseLabel?: string;
  tooltipPrefix?: string;
  testId?: string;
  className?: string;
}

export function StatusPill({
  bucket,
  bucketLabel,
  preciseLabel,
  tooltipPrefix,
  testId,
  className,
}: StatusPillProps) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;

  const pill = (
    <Badge
      className={cn("inline-flex items-center gap-1 border", meta.pillClass, className)}
      data-testid={testId}
      data-status-bucket={bucket}
    >
      <Icon className={cn("h-3 w-3", meta.iconClass)} />
      <span>{bucketLabel}</span>
    </Badge>
  );

  const trimmedPrecise = (preciseLabel ?? "").trim();
  if (!trimmedPrecise || trimmedPrecise === bucketLabel.trim()) {
    return pill;
  }

  const tooltipText = tooltipPrefix
    ? `${tooltipPrefix} ${trimmedPrecise}`
    : trimmedPrecise;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{pill}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
