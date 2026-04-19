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
  // Serve the closest pre-generated asset size to avoid over-downloading logo bytes.
  const src = size <= 72
    ? "/icons/vex-gaming-logo-72x72.png"
    : size <= 96
      ? "/icons/vex-gaming-logo-96x96.png"
      : size <= 128
        ? "/icons/vex-gaming-logo-128x128.png"
        : size <= 144
          ? "/icons/vex-gaming-logo-144x144.png"
          : size <= 152
            ? "/icons/vex-gaming-logo-152x152.png"
            : size <= 192
              ? "/icons/vex-gaming-logo-192x192.png"
              : size <= 384
                ? "/icons/vex-gaming-logo-384x384.png"
                : "/icons/vex-gaming-logo-512x512.png";
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
