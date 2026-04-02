import { cn } from "@/lib/utils";

interface ProjectCurrencySymbolProps {
    className?: string;
}

interface ProjectCurrencyAmountProps {
    amount: string | number;
    className?: string;
    symbolClassName?: string;
    amountClassName?: string;
    fractionDigits?: number;
}

function normalizeAmount(amount: string | number): number {
    const parsed = typeof amount === "number" ? amount : Number.parseFloat(amount);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function ProjectCurrencySymbol({ className }: ProjectCurrencySymbolProps) {
    return (
        <span
            aria-label="Project currency symbol"
            className={cn(
                "inline-flex items-center justify-center leading-none font-black italic lowercase text-transparent bg-clip-text bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-700 drop-shadow-[0_0_6px_rgba(16,185,129,0.45)]",
                className,
            )}
        >
            v
        </span>
    );
}

export function ProjectCurrencyAmount({
    amount,
    className,
    symbolClassName,
    amountClassName,
    fractionDigits = 2,
}: ProjectCurrencyAmountProps) {
    const safeAmount = normalizeAmount(amount);

    return (
        <span className={cn("inline-flex items-center gap-1", className)}>
            <ProjectCurrencySymbol className={cn("text-base", symbolClassName)} />
            <span className={amountClassName}>{safeAmount.toFixed(fractionDigits)}</span>
        </span>
    );
}
