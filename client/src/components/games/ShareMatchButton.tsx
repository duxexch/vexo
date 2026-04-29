import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Share2,
  Copy,
  Check,
  MessageCircle,
  Send,
} from "lucide-react";
import { SiWhatsapp, SiFacebook, SiX, SiTelegram } from "react-icons/si";

interface ShareMatchButtonProps {
  challengeId: string;
  gameType: string;
  className?: string;
}

export function ShareMatchButton({
  challengeId,
  gameType,
  className,
}: ShareMatchButtonProps) {
  const { language } = useI18n();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const matchUrl = `${window.location.origin}/challenge/${challengeId}/watch`;
  const shareImageUrl = `${window.location.origin}/api/share-image?type=game&title=${encodeURIComponent(gameType)}&titleAr=${encodeURIComponent(gameType === "chess" ? "الشطرنج" : "الدومينو")}&description=${encodeURIComponent("شاهد مباراة مثيرة الآن!")}&descriptionAr=${encodeURIComponent("شاهد مباراة مثيرة الآن!")}&url=${encodeURIComponent(matchUrl)}`;

  const shareText = language === "ar"
    ? `شاهد مباراة ${gameType === "chess" ? "الشطرنج" : "الدومينو"} المثيرة الآن!`
    : `Watch this exciting ${gameType} match now!`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(matchUrl);
      setCopied(true);
      toast({
        title: language === "ar" ? "تم النسخ!" : "Copied!",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: language === "ar" ? "فشل النسخ" : "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const shareLinks = [
    {
      name: "WhatsApp",
      icon: SiWhatsapp,
      color: "text-green-500",
      url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${matchUrl}`)}`,
    },
    {
      name: "Facebook",
      icon: SiFacebook,
      color: "text-blue-600",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(matchUrl)}&quote=${encodeURIComponent(shareText)}`,
    },
    {
      name: "X (Twitter)",
      icon: SiX,
      color: "text-foreground",
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(matchUrl)}`,
    },
    {
      name: "Telegram",
      icon: SiTelegram,
      color: "text-blue-500",
      url: `https://t.me/share/url?url=${encodeURIComponent(matchUrl)}&text=${encodeURIComponent(shareText)}`,
    },
  ];

  const handleShare = (url: string) => {
    window.open(url, "_blank", "width=600,height=400");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: language === "ar" ? "مشاركة المباراة" : "Share Match",
          text: shareText,
          url: matchUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setShowDialog(true);
        }
      }
    } else {
      setShowDialog(true);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2", className)}
            data-testid="button-share-match"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">
              {language === "ar" ? "مشاركة" : "Share"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleCopy} data-testid="share-copy-link">
            {copied ? (
              <Check className="h-4 w-4 me-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 me-2" />
            )}
            {language === "ar" ? "نسخ الرابط" : "Copy Link"}
          </DropdownMenuItem>

          {shareLinks.map((link) => (
            <DropdownMenuItem
              key={link.name}
              onClick={() => handleShare(link.url)}
              data-testid={`share-${link.name.toLowerCase()}`}
            >
              <link.icon className={cn("h-4 w-4 me-2", link.color)} />
              {link.name}
            </DropdownMenuItem>
          ))}

          {typeof navigator.share === "function" && (
            <DropdownMenuItem onClick={handleNativeShare} data-testid="share-more">
              <Send className="h-4 w-4 me-2" />
              {language === "ar" ? "المزيد..." : "More..."}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ar" ? "مشاركة المباراة" : "Share Match"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {language === "ar" ? "رابط المباراة" : "Match Link"}
              </label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={matchUrl}
                  readOnly
                  className="flex-1"
                  data-testid="input-share-url"
                />
                <Button onClick={handleCopy} size="icon" data-testid="button-copy-url">
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {shareLinks.map((link) => (
                <div key={link.name} className="flex flex-col items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleShare(link.url)}
                    data-testid={`dialog-share-${link.name.toLowerCase()}`}
                  >
                    <link.icon className={cn("h-5 w-5", link.color)} />
                  </Button>
                  <span className="text-xs text-muted-foreground">{link.name}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
