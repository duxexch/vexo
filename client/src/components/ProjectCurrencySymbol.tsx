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
        <img
            src="/icons/vxc-currency-icon.png"
            alt="VXC"
            draggable={false}
            className={cn(
                "inline-block h-[1em] w-[1em] min-h-[14px] min-w-[14px] rounded-[0.2em] object-contain align-[-0.12em] shadow-[0_0_6px_rgba(16,185,129,0.35)]",
                className,
            )}
        />
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
            <ProjectCurrencySymbol className={cn("text-sm", symbolClassName)} />
            <span className={amountClassName}>{safeAmount.toFixed(fractionDigits)}</span>
        </span>
    );
}
