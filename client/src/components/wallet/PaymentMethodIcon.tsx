import { useEffect, useState, type ComponentType } from "react";
import {
  Bitcoin,
  Building2,
  CreditCard,
  Smartphone,
} from "lucide-react";

type LucideIcon = ComponentType<{ className?: string }>;

function getFallbackIcon(type: string | null | undefined): LucideIcon {
  switch (type) {
    case "bank_transfer":
      return Building2;
    case "card":
      return CreditCard;
    case "e_wallet":
      return Smartphone;
    case "crypto":
      return Bitcoin;
    default:
      return CreditCard;
  }
}

interface Props {
  iconUrl?: string | null;
  type?: string | null;
  alt?: string;
  className?: string;
}

export function PaymentMethodIcon({ iconUrl, type, alt, className }: Props) {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [iconUrl]);
  const FallbackIcon = getFallbackIcon(type);

  const sizeClass = className ?? "h-6 w-6";

  if (iconUrl && !errored) {
    return (
      <img
        src={iconUrl}
        alt={alt || ""}
        loading="lazy"
        className={`${sizeClass} object-contain`}
        onError={() => setErrored(true)}
      />
    );
  }

  return <FallbackIcon className={sizeClass} />;
}
