/**
 * VEX Logo Component — renders the official VEX brand logo image
 * Uses /icons/vex-gaming-logo-192x192.png (small) or /icons/vex-gaming-logo-512x512.png (large) for crisp rendering
 * 
 * Usage:
 *   <VexLogo size={32} />                — sidebar
 *   <VexLogo size={64} />                — login page  
 *   <VexLogo size={48} className="animate-pulse" />  — loading screen
 */

interface VexLogoProps {
  /** Display size in pixels (width & height) */
  size?: number;
  /** Additional CSS classes (e.g. animate-pulse) */
  className?: string;
  /** Alt text override */
  alt?: string;
  /** Optional loading strategy override */
  loading?: "eager" | "lazy";
  /** Optional fetch priority override for above-the-fold usage */
  fetchPriority?: "high" | "low" | "auto";
}

export function VexLogo({ size = 32, className = "", alt = "VEX", loading, fetchPriority }: VexLogoProps) {
  // Use 192px source for small/medium displays, 512px for large
  const src = size > 128 ? "/icons/vex-gaming-logo-512x512.png" : "/icons/vex-gaming-logo-192x192.png";
  const resolvedLoading = loading ?? (size <= 48 ? "eager" : "lazy");
  const resolvedFetchPriority = fetchPriority ?? (resolvedLoading === "eager" ? "high" : "auto");

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-lg object-contain ${className}`.trim()}
      loading={resolvedLoading}
      fetchPriority={resolvedFetchPriority}
      decoding="async"
      draggable={false}
    />
  );
}

export default VexLogo;
