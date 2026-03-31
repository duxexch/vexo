import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "" : "flex-row-reverse"}`}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className={`space-y-1.5 ${i % 2 === 0 ? "" : "items-end"}`}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className={`h-10 rounded-xl ${i % 3 === 0 ? "w-48" : i % 3 === 1 ? "w-32" : "w-56"}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
