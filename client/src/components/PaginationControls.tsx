import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  isFirstPage: boolean;
  isLastPage: boolean;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  onPrev,
  onNext,
  isFirstPage,
  isLastPage,
  className = "",
}: PaginationControlsProps) {
  const { t } = useI18n();

  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-3 pt-4 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={isFirstPage}
        className="min-h-[44px] min-w-[44px]"
      >
        <ChevronLeft className="h-4 w-4 me-1" />
        {t("common.previous") || "Previous"}
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={isLastPage}
        className="min-h-[44px] min-w-[44px]"
      >
        {t("common.next") || "Next"}
        <ChevronRight className="h-4 w-4 ms-1" />
      </Button>
    </div>
  );
}
