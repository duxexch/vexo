import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { apiRequestWithPaymentToken } from "@/lib/payment-operation";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Wallet, Plus, ArrowUpRight, ArrowDownRight, Star, Filter, RefreshCw, Trash2, Edit2, Check, AlertTriangle, MessageSquare, Upload, FileCheck, Camera, Video, Ban, Clock, ChevronRight, Send, Paperclip, Eye, Shield, Scale, History, User, Settings } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
interface P2POffer {
  id: string;
  userId: string;
  username: string;
  country?: string | null;
  type: "buy" | "sell";
  amount: string;
  price: string;
  currency: string;
  minLimit: string;
  maxLimit: string;
  paymentMethods: string[];
  paymentTimeLimit?: number;
  terms?: string | null;
  autoReply?: string | null;
  rating: number;
  completedTrades: number;
  status: "active" | "inactive" | "completed";
  createdAt: string;
}

interface P2PTrade {
  id: string;
  offerId: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  price: string;
  totalPrice?: string;
  fiatAmount?: string;
  paymentMethod?: string;
  expiresAt?: string | null;
  isBuyer?: boolean;
  isSeller?: boolean;
  status: "pending" | "paid" | "confirmed" | "completed" | "cancelled" | "disputed";
  createdAt: string;
  completedAt: string | null;
  counterpartyUsername: string;
}

interface P2PTradeDetails extends P2PTrade {
  buyer?: { id: string; username: string; nickname?: string | null } | null;
  seller?: { id: string; username: string; nickname?: string | null } | null;
}

interface P2PTradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  message: string;
  isSystemMessage: boolean;
  isPrewritten: boolean;
  createdAt: string;
  sender?: { id: string; username: string; nickname?: string | null } | null;
}

interface OfferPaymentMethodOption {
  id: string;
  type: string;
  name: string;
  displayLabel?: string | null;
  isVerified: boolean;
}

interface OfferEligibility {
  canCreateOffer: boolean;
  reasons: string[];
  paymentMethods: OfferPaymentMethodOption[];
  allowedCurrencies: string[];
  allowedBuyCurrencies?: string[];
  allowedSellCurrencies?: string[];
  depositEnabledCurrencies?: string[];
  allowedPaymentTimeLimits: number[];
  checks: {
    notBanned: boolean;
    verificationPassed: boolean;
    adPermissionGranted: boolean;
    hasActivePaymentMethods: boolean;
    p2pEnabled: boolean;
  };
}

interface P2PDispute {
  id: string;
  tradeId: string;
  initiatorId: string;
  initiatorName?: string;
  respondentId: string;
  respondentName: string;
  status: "open" | "investigating" | "resolved" | "closed";
  reason: string;
  description: string;
  stage: "peer_negotiation" | "support_review" | "resolved";
  peerNegotiationEndsAt: string;
  tradeAmount: string;
  tradeFiatAmount: string;
  createdAt: string;
}

interface P2PDisputeMessage {
  id: string;
  disputeId: string;
  senderId: string;
  senderName: string;
  message: string;
  isPrewritten: boolean;
  isFromSupport: boolean;
  createdAt: string;
}

interface P2PDisputeEvidence {
  id: string;
  disputeId: string;
  uploaderId: string;
  uploaderName: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  description: string;
  evidenceType: string;
  isVerified: boolean;
  createdAt: string;
}

interface P2PTransactionLog {
  id: string;
  tradeId: string;
  disputeId?: string;
  userId: string;
  action: string;
  description: string;
  descriptionAr?: string;
  createdAt: string;
}

interface PrewrittenResponse {
  id: string;
  category: string;
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
}

interface DisputeRule {
  id: string;
  category: string;
  title: string;
  titleAr?: string;
  content: string;
  contentAr?: string;
  icon: string;
}

const createOfferSchema = z.object({
  type: z.enum(["buy", "sell"]),
  amount: z.string().min(1),
  price: z.string().min(1),
  currency: z.string().min(1),
  minLimit: z.string().min(1),
  maxLimit: z.string().min(1),
  paymentMethodIds: z.array(z.string()).min(1),
  paymentTimeLimit: z.string().min(1),
  terms: z.string().max(1200).optional(),
  autoReply: z.string().max(500).optional(),
});

type CreateOfferForm = z.infer<typeof createOfferSchema>;

const SAFE_PREVIEW_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function isAllowedEvidenceMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith("image/") || normalized.startsWith("video/") || normalized === "application/pdf";
}

function canPreviewImageFile(mimeType: string): boolean {
  return SAFE_PREVIEW_IMAGE_TYPES.has((mimeType || "").toLowerCase());
}

function sanitizeDisplayText(rawText: string): string {
  if (!rawText) return "";

  // Keep evidence filenames as plain text only.
  return rawText
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function normalizeSafeEvidenceUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function formatNumericValue(
  rawValue: string | number,
  locale: string,
  maxFractionDigits = 8,
  minFractionDigits = 0,
): string {
  const parsedValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return "0";
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(parsedValue);
}

function formatFixedFiat(rawValue: string | number, locale: string): string {
  return `$${formatNumericValue(rawValue, locale, 2, 2)}`;
}

function formatAssetAmount(rawAmount: string | number, currencyCode: string, locale: string): string {
  return `${formatNumericValue(rawAmount, locale, 8, 0)} ${String(currencyCode || "").toUpperCase()}`;
}

function formatFiatRange(minValue: string | number, maxValue: string | number, locale: string): string {
  return `${formatFixedFiat(minValue, locale)} - ${formatFixedFiat(maxValue, locale)}`;
}

function resolveLanguageLocale(languageCode?: string): string {
  const normalizedCode = String(languageCode || "en").trim();
  const requestedLocale = normalizedCode === "ar" ? "ar-SA-u-nu-arab" : normalizedCode;

  try {
    new Intl.NumberFormat(requestedLocale);
    return requestedLocale;
  } catch {
    return "en-US";
  }
}

function formatLocalizedDate(dateValue: string | Date, locale: string): string {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }
  return parsedDate.toLocaleDateString(locale);
}

function formatLocalizedTime(dateValue: string | Date, locale: string): string {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }
  return parsedDate.toLocaleTimeString(locale);
}

function formatLocalizedDateTime(dateValue: string | Date, locale: string): string {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }
  return parsedDate.toLocaleString(locale);
}

function MarketplaceTab() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const [amountFilter, setAmountFilter] = useState("");
  const [showTopRatedOnly, setShowTopRatedOnly] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<P2POffer | null>(null);
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradePaymentMethod, setTradePaymentMethod] = useState("");
  const numberLocale = resolveLanguageLocale(language);

  const { data: offerEligibility } = useQuery<OfferEligibility>({
    queryKey: ["/api/p2p/offer-eligibility"],
  });

  const { data: offers, isLoading, refetch } = useQuery<P2POffer[]>({
    queryKey: ["/api/p2p/offers"],
  });

  const offersByType = useMemo(() => {
    return (offers || []).filter((offer) => (typeFilter === "all" ? true : offer.type === typeFilter));
  }, [offers, typeFilter]);

  const countryOptions = useMemo(() => {
    const mapByNormalized = new Map<string, string>();

    for (const offer of offersByType) {
      const countryLabel = String(offer.country || "").trim();
      if (!countryLabel) continue;

      const normalized = countryLabel.toLowerCase();
      if (!mapByNormalized.has(normalized)) {
        mapByNormalized.set(normalized, countryLabel);
      }
    }

    return Array.from(mapByNormalized.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [offersByType]);

  const offersByTypeAndCountry = useMemo(() => {
    if (countryFilter === "all") {
      return offersByType;
    }

    return offersByType.filter((offer) => String(offer.country || "").trim().toLowerCase() === countryFilter);
  }, [offersByType, countryFilter]);

  const currencyOptions = useMemo(() => {
    const configured = (offerEligibility?.allowedCurrencies || [])
      .map((currency) => String(currency || "").toUpperCase().trim())
      .filter((currency) => currency.length > 0);

    const fromOffers = offersByTypeAndCountry
      .map((offer) => String(offer.currency || "").toUpperCase().trim())
      .filter((currency) => currency.length > 0);

    return Array.from(new Set([...fromOffers, ...configured])).sort((a, b) => a.localeCompare(b));
  }, [offerEligibility?.allowedCurrencies, offersByTypeAndCountry]);

  const offersByTypeCountryAndCurrency = useMemo(() => {
    if (currencyFilter === "all") {
      return offersByTypeAndCountry;
    }

    return offersByTypeAndCountry.filter((offer) => String(offer.currency || "").toUpperCase() === currencyFilter);
  }, [offersByTypeAndCountry, currencyFilter]);

  const paymentOptions = useMemo(() => {
    return Array.from(new Set(
      offersByTypeCountryAndCurrency.flatMap((offer) => (offer.paymentMethods || []).map((method) => method.trim()).filter((method) => method.length > 0))
    )).sort((a, b) => a.localeCompare(b));
  }, [offersByTypeCountryAndCurrency]);

  useEffect(() => {
    if (countryFilter === "all") {
      return;
    }

    if (!countryOptions.some((option) => option.value === countryFilter)) {
      setCountryFilter("all");
    }
  }, [countryFilter, countryOptions]);

  useEffect(() => {
    if (currencyFilter === "all") {
      return;
    }

    if (!currencyOptions.includes(currencyFilter)) {
      setCurrencyFilter("all");
    }
  }, [currencyFilter, currencyOptions]);

  useEffect(() => {
    if (paymentFilter === "all") {
      return;
    }

    if (!paymentOptions.includes(paymentFilter)) {
      setPaymentFilter("all");
    }
  }, [paymentFilter, paymentOptions]);

  const filteredOffers = useMemo(() => {
    const numericAmountFilter = parseFloat(amountFilter);
    const shouldFilterByAmount = Number.isFinite(numericAmountFilter) && numericAmountFilter > 0;

    let next = offersByTypeCountryAndCurrency.filter((offer) => {
      if (paymentFilter !== "all" && !offer.paymentMethods.includes(paymentFilter)) return false;
      if (showTopRatedOnly && offer.rating < 4.8) return false;

      if (shouldFilterByAmount) {
        const offerMin = parseFloat(offer.minLimit);
        const offerMax = parseFloat(offer.maxLimit);
        if (numericAmountFilter < offerMin || numericAmountFilter > offerMax) {
          return false;
        }
      }

      return true;
    });

    if (priceSort !== "none") {
      next = [...next].sort((a, b) => {
        const aPrice = parseFloat(a.price);
        const bPrice = parseFloat(b.price);
        if (priceSort === "asc") return aPrice - bPrice;
        return bPrice - aPrice;
      });
    }

    return next;
  }, [offersByTypeCountryAndCurrency, paymentFilter, amountFilter, showTopRatedOnly, priceSort]);

  const createTradeMutation = useMutation({
    mutationFn: async (payload: { offerId: string; amount: string; paymentMethod: string }) => {
      const res = await apiRequestWithPaymentToken("POST", "/api/p2p/trades", {
        offerId: payload.offerId,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod,
      }, "p2p_trade_create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/offers"] });
      setSelectedOffer(null);
      setTradeAmount("");
      setTradePaymentMethod("");
      toast({
        title: t('p2p.tradeInitiated'),
        description: t('p2p.tradeInitiatedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTrade = (offer: P2POffer) => {
    const defaultAmount = offer.minLimit || offer.amount;
    setSelectedOffer(offer);
    setTradeAmount(defaultAmount);
    setTradePaymentMethod(offer.paymentMethods?.[0] || "");
  };

  const getActionLabel = (offer: P2POffer) => {
    return offer.type === "sell" ? t('p2p.buy') : t('p2p.sell');
  };

  const submitTrade = () => {
    if (!selectedOffer) {
      return;
    }

    const parsedAmount = parseFloat(tradeAmount);
    const minLimit = parseFloat(selectedOffer.minLimit);
    const maxLimit = parseFloat(selectedOffer.maxLimit);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: t('common.error'),
        description: t('transactions.enterAmount'),
        variant: "destructive",
      });
      return;
    }

    if (parsedAmount < minLimit || parsedAmount > maxLimit) {
      toast({
        title: t('common.error'),
        description: `${t('p2p.limit')}: ${formatFiatRange(selectedOffer.minLimit, selectedOffer.maxLimit, numberLocale)}`,
        variant: "destructive",
      });
      return;
    }

    if (!tradePaymentMethod) {
      toast({
        title: t('common.error'),
        description: t('p2p.paymentMethod'),
        variant: "destructive",
      });
      return;
    }

    createTradeMutation.mutate({
      offerId: selectedOffer.id,
      amount: tradeAmount,
      paymentMethod: tradePaymentMethod,
    });
  };

  const tradeAmountNumeric = Number(tradeAmount);
  const selectedOfferPrice = Number(selectedOffer?.price ?? 0);
  const previewHasValidAmount = Number.isFinite(tradeAmountNumeric) && tradeAmountNumeric > 0;
  const previewTotalPrice = previewHasValidAmount && Number.isFinite(selectedOfferPrice)
    ? tradeAmountNumeric * selectedOfferPrice
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl shadow-slate-900/40">
        <div className="flex items-center justify-between gap-3 bg-[#f0c73f] px-3 py-2 text-slate-900 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-semibold sm:text-base">{t('p2p.marketplace')}</span>
          </div>

          <Badge className="bg-white/85 text-slate-900 hover:bg-white/85">
            {t('p2p.filters')}
          </Badge>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="min-w-[130px] shrink-0">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100" data-testid="select-type-filter">
                  <SelectValue placeholder={t('p2p.type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('p2p.all')}</SelectItem>
                  <SelectItem value="buy">{t('p2p.buy')}</SelectItem>
                  <SelectItem value="sell">{t('p2p.sell')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px] shrink-0">
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100" data-testid="select-country-filter">
                  <SelectValue placeholder={t('p2p.country')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('p2p.all')}</SelectItem>
                  {countryOptions.map((countryOption) => (
                    <SelectItem key={countryOption.value} value={countryOption.value}>{countryOption.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[130px] shrink-0">
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100" data-testid="select-currency-filter">
                  <SelectValue placeholder={t('p2p.currency')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('p2p.all')}</SelectItem>
                  {currencyOptions.map((currencyCode) => (
                    <SelectItem key={currencyCode} value={currencyCode}>{currencyCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[170px] shrink-0">
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100" data-testid="select-payment-filter">
                  <SelectValue placeholder={t('p2p.paymentMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('p2p.all')}</SelectItem>
                  {paymentOptions.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Input
              value={amountFilter}
              onChange={(event) => setAmountFilter(event.target.value)}
              type="number"
              placeholder={t('common.amount')}
              className="min-w-[130px] shrink-0 border-slate-700 bg-slate-900 text-slate-100"
              data-testid="input-amount-filter"
            />

            <div className="min-w-[130px] shrink-0">
              <Select value={priceSort} onValueChange={(value) => setPriceSort(value as "none" | "asc" | "desc")}>
                <SelectTrigger className="border-slate-700 bg-slate-900 text-slate-100" data-testid="select-price-sort">
                  <SelectValue placeholder={t('p2p.price')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('p2p.price')}</SelectItem>
                  <SelectItem value="asc">{`${t('p2p.price')} ↑`}</SelectItem>
                  <SelectItem value="desc">{`${t('p2p.price')} ↓`}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-[110px] shrink-0 items-center justify-between rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
              <div className="flex items-center gap-2 text-slate-300">
                <Shield className="h-4 w-4 text-[#f0c73f]" />
                <Star className="h-4 w-4 text-[#f0c73f]" />
              </div>
              <Switch
                checked={showTopRatedOnly}
                onCheckedChange={setShowTopRatedOnly}
                data-testid="switch-top-rated-filter"
              />
            </div>

            <Button
              variant="outline"
              className="min-w-[110px] shrink-0 border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
              onClick={() => refetch()}
              data-testid="button-refresh-offers"
            >
              <Filter className="me-2 h-4 w-4" />
              {t('common.filter')}
            </Button>
          </div>
        </div>
      </div>

      {filteredOffers.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Wallet} title={t('p2p.noOffers')} description={t('p2p.noOffersDesc')} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {filteredOffers.map((offer) => (
              <Card
                key={offer.id}
                className="border-slate-800 bg-slate-950/80 text-slate-100"
                data-testid={`row-offer-${offer.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold" data-testid={`text-trader-${offer.id}`}>{offer.username}</span>
                        <Badge className="bg-slate-700 text-slate-100 hover:bg-slate-700">
                          {offer.type === "buy" ? t('p2p.buy') : t('p2p.sell')}
                        </Badge>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <Star className="h-3.5 w-3.5 fill-[#f0c73f] text-[#f0c73f]" />
                        <span className="tabular-nums">{formatNumericValue(offer.rating, numberLocale, 2, 2)}</span>
                        <span>•</span>
                        <span>{formatNumericValue(offer.completedTrades, numberLocale, 0, 0)} {t('p2p.trades')}</span>
                        {offer.paymentTimeLimit ? (
                          <>
                            <span>•</span>
                            <span>{offer.paymentTimeLimit}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="min-h-[42px] min-w-[90px] bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                      onClick={() => handleTrade(offer)}
                      disabled={createTradeMutation.isPending || offer.paymentMethods.length === 0}
                      data-testid={`button-trade-${offer.id}`}
                    >
                      {getActionLabel(offer)}
                    </Button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('p2p.price')}</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-slate-100" data-testid={`text-price-${offer.id}`}>
                        {formatFixedFiat(offer.price, numberLocale)}
                      </p>
                    </div>

                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('common.amount')}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-100" data-testid={`text-amount-${offer.id}`}>
                        {formatAssetAmount(offer.amount, offer.currency, numberLocale)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs tabular-nums text-slate-400">
                    {t('p2p.limit')}: {formatFiatRange(offer.minLimit, offer.maxLimit, numberLocale)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {offer.paymentMethods.slice(0, 2).map((method) => (
                      <Badge key={method} variant="outline" className="border-slate-700 text-slate-300">
                        {method.replace("_", " ")}
                      </Badge>
                    ))}
                    {offer.paymentMethods.length > 2 && (
                      <Badge variant="outline" className="border-slate-700 text-slate-300">
                        +{offer.paymentMethods.length - 2}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden rounded-xl border border-slate-800 bg-slate-950/80 lg:block">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="w-[24%] text-slate-300">{t('p2p.trader')}</TableHead>
                  <TableHead className="w-[10%] text-slate-300">{t('p2p.type')}</TableHead>
                  <TableHead className="w-[16%] text-slate-300">{t('common.amount')}</TableHead>
                  <TableHead className="w-[12%] text-slate-300">{t('p2p.price')}</TableHead>
                  <TableHead className="w-[16%] text-slate-300">{t('p2p.limit')}</TableHead>
                  <TableHead className="w-[14%] text-slate-300">{t('p2p.paymentMethods')}</TableHead>
                  <TableHead className="w-[8%] text-slate-300">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOffers.map((offer) => (
                  <TableRow key={offer.id} className="border-slate-800 hover:bg-slate-900/60" data-testid={`row-offer-${offer.id}`}>
                    <TableCell className="max-w-0">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate text-slate-100" data-testid={`text-trader-${offer.id}`}>{offer.username}</span>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <Star className="h-3 w-3 shrink-0 fill-[#f0c73f] text-[#f0c73f]" />
                          <span className="tabular-nums">{formatNumericValue(offer.rating, numberLocale, 2, 2)}</span>
                          <span>•</span>
                          <span>{formatNumericValue(offer.completedTrades, numberLocale, 0, 0)} {t('p2p.trades')}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-slate-700 text-slate-100 hover:bg-slate-700">
                        {offer.type === "buy" ? t('p2p.buy') : t('p2p.sell')}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-amount-${offer.id}`} className="text-slate-100 break-words">
                      <span className="tabular-nums">{formatAssetAmount(offer.amount, offer.currency, numberLocale)}</span>
                    </TableCell>
                    <TableCell data-testid={`text-price-${offer.id}`} className="text-slate-100 font-semibold tabular-nums">
                      {formatFixedFiat(offer.price, numberLocale)}
                    </TableCell>
                    <TableCell className="text-slate-300 break-words">
                      <span className="tabular-nums">{formatFiatRange(offer.minLimit, offer.maxLimit, numberLocale)}</span>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="flex flex-wrap gap-1">
                        {offer.paymentMethods.slice(0, 2).map((method) => (
                          <Badge key={method} variant="outline" className="border-slate-700 text-slate-300">
                            {method.replace("_", " ")}
                          </Badge>
                        ))}
                        {offer.paymentMethods.length > 2 && (
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            +{offer.paymentMethods.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        className="min-h-[40px] min-w-[92px] bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                        onClick={() => handleTrade(offer)}
                        disabled={createTradeMutation.isPending || offer.paymentMethods.length === 0}
                        data-testid={`button-trade-${offer.id}`}
                      >
                        {getActionLabel(offer)}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog
        open={Boolean(selectedOffer)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOffer(null);
            setTradeAmount("");
            setTradePaymentMethod("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('p2p.trade')}</DialogTitle>
            <DialogDescription>{t('p2p.tradeInitiatedDesc')}</DialogDescription>
          </DialogHeader>

          {selectedOffer && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{selectedOffer.username}</span>
                  <Badge variant={selectedOffer.type === "buy" ? "default" : "secondary"}>
                    {selectedOffer.type === "buy" ? t('p2p.buy') : t('p2p.sell')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatAssetAmount(selectedOffer.amount, selectedOffer.currency, numberLocale)} @ {formatFixedFiat(selectedOffer.price, numberLocale)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('p2p.limit')}: {formatFiatRange(selectedOffer.minLimit, selectedOffer.maxLimit, numberLocale)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('common.amount')}</Label>
                <Input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  data-testid="input-trade-amount"
                />
              </div>

              <div className="rounded-lg border p-3 space-y-2" data-testid="trade-amount-preview">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t('common.amount')}</span>
                  <span className="font-medium tabular-nums">
                    {previewHasValidAmount
                      ? formatAssetAmount(tradeAmountNumeric, selectedOffer.currency, numberLocale)
                      : formatAssetAmount(0, selectedOffer.currency, numberLocale)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t('p2p.price')}</span>
                  <span className="font-medium tabular-nums">{formatFixedFiat(selectedOffer.price, numberLocale)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t('p2p.totalPrice')}</span>
                  <span className="font-semibold tabular-nums">
                    {formatFixedFiat(previewTotalPrice, numberLocale)}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t('p2p.limit')}</span>
                  <span className="font-medium tabular-nums">{formatFiatRange(selectedOffer.minLimit, selectedOffer.maxLimit, numberLocale)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('p2p.paymentMethod')}</Label>
                <Select value={tradePaymentMethod} onValueChange={setTradePaymentMethod}>
                  <SelectTrigger data-testid="select-trade-payment-method">
                    <SelectValue placeholder={t('p2p.paymentMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOffer.paymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>{method}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOffer.terms && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-6">{selectedOffer.terms}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedOffer(null);
                setTradeAmount("");
                setTradePaymentMethod("");
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submitTrade}
              disabled={createTradeMutation.isPending}
              data-testid="button-confirm-create-trade"
            >
              {createTradeMutation.isPending ? t('common.loading') : t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyOffersTab() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const numberLocale = resolveLanguageLocale(language);

  const { data: myOffers, isLoading } = useQuery<P2POffer[]>({
    queryKey: ["/api/p2p/my-offers"],
  });

  const { data: offerEligibility, isLoading: eligibilityLoading } = useQuery<OfferEligibility>({
    queryKey: ["/api/p2p/offer-eligibility"],
  });

  const form = useForm<CreateOfferForm>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: {
      type: "sell",
      amount: "",
      price: "",
      currency: "USD",
      minLimit: "",
      maxLimit: "",
      paymentMethodIds: [],
      paymentTimeLimit: "15",
      terms: "",
      autoReply: "",
    },
  });

  const selectedOfferType = form.watch("type");

  const availableOfferCurrencies = useMemo(() => {
    const fallbackCurrencies = offerEligibility?.allowedCurrencies || ["USD", "USDT", "EUR", "GBP", "SAR", "AED", "EGP"];
    const buyCurrencies = offerEligibility?.allowedBuyCurrencies || fallbackCurrencies;
    const sellCurrencies = offerEligibility?.allowedSellCurrencies || fallbackCurrencies;

    return selectedOfferType === "buy"
      ? buyCurrencies
      : sellCurrencies;
  }, [offerEligibility?.allowedBuyCurrencies, offerEligibility?.allowedCurrencies, offerEligibility?.allowedSellCurrencies, selectedOfferType]);

  useEffect(() => {
    if (availableOfferCurrencies.length === 0) {
      return;
    }

    const currentCurrency = form.getValues("currency");
    if (!availableOfferCurrencies.includes(currentCurrency)) {
      form.setValue("currency", availableOfferCurrencies[0]);
    }
  }, [availableOfferCurrencies, form]);

  const createOfferMutation = useMutation({
    mutationFn: async (data: CreateOfferForm) => {
      const res = await apiRequest("POST", "/api/p2p/offers", {
        ...data,
        paymentMethodIds: data.paymentMethodIds,
        paymentTimeLimit: Number(data.paymentTimeLimit),
        terms: data.terms?.trim() || undefined,
        autoReply: data.autoReply?.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/my-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/offer-eligibility"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: t('common.success'),
        description: t('p2p.offerCreated'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await apiRequest("DELETE", `/api/p2p/offers/${offerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/my-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/offers"] });
      toast({
        title: t('common.success'),
        description: t('p2p.offerDeleted'),
      });
    },
  });

  const onSubmit = (data: CreateOfferForm) => {
    if (availableOfferCurrencies.length === 0) {
      toast({
        title: t('common.error'),
        description: t('p2p.noCurrencyFound'),
        variant: "destructive",
      });
      return;
    }

    if (!availableOfferCurrencies.includes(data.currency)) {
      toast({
        title: t('common.error'),
        description: t('p2p.noCurrencyFound'),
        variant: "destructive",
      });
      return;
    }

    if (!offerEligibility?.canCreateOffer) {
      toast({
        title: t('common.error'),
        description: offerEligibility?.reasons?.[0] || t('common.error'),
        variant: "destructive",
      });
      return;
    }

    createOfferMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      completed: "outline",
    };
    const labels: Record<string, string> = {
      active: t('p2p.statusActive'),
      inactive: t('p2p.statusInactive'),
      completed: t('p2p.statusCompleted'),
    };
    return <Badge variant={variants[status] || "default"} >{labels[status] || status}</Badge>;
  };

  const sortedOffers = useMemo(() => {
    return [...(myOffers || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myOffers]);

  const offerStats = useMemo(() => {
    const counters = {
      total: sortedOffers.length,
      active: 0,
      inactive: 0,
      completed: 0,
    };

    for (const offer of sortedOffers) {
      if (offer.status === "active") counters.active += 1;
      if (offer.status === "inactive") counters.inactive += 1;
      if (offer.status === "completed") counters.completed += 1;
    }

    return counters;
  }, [sortedOffers]);

  const getStatusPillClass = (status: string) => {
    if (status === "active") return "border-emerald-600/40 bg-emerald-600/10 text-emerald-300";
    if (status === "inactive") return "border-slate-700 bg-slate-800 text-slate-200";
    return "border-sky-600/40 bg-sky-600/10 text-sky-300";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {offerEligibility && !offerEligibility.canCreateOffer && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t('common.error')}
            </CardTitle>
            <CardDescription>
              {t('p2p.createOfferDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {offerEligibility.reasons.map((reason, idx) => (
              <p key={idx} className="text-sm text-muted-foreground">- {reason}</p>
            ))}
            <div className="pt-2">
              <Link href="/p2p/settings">
                <Button variant="outline" size="sm">{t('p2p.settings.title')}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100">
        <div className="flex items-center justify-between gap-2 bg-[#f0c73f] px-3 py-2 text-slate-900 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <h3 className="text-sm font-semibold sm:text-base">{t('p2p.yourOffers')}</h3>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-8 bg-slate-900 text-[#f0c73f] hover:bg-slate-900/90"
                data-testid="button-create-offer"
                disabled={eligibilityLoading}
              >
                <Plus className="h-4 w-4 me-1" />
                {t('p2p.createOffer')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('p2p.createOffer')}</DialogTitle>
                <DialogDescription>{t('p2p.createOfferDesc')}</DialogDescription>
              </DialogHeader>

              {offerEligibility && !offerEligibility.canCreateOffer && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                  {offerEligibility.reasons.map((reason, idx) => (
                    <p key={idx}>{reason}</p>
                  ))}
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('p2p.type')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-offer-type">
                              <SelectValue placeholder={t('p2p.selectType')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="buy">{t('p2p.buy')}</SelectItem>
                            <SelectItem value="sell">{t('p2p.sell')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('common.amount')}</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" placeholder="100" data-testid="input-offer-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('p2p.currency')}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-offer-currency">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableOfferCurrencies.map((supportedCurrency) => (
                                <SelectItem key={supportedCurrency} value={supportedCurrency}>{supportedCurrency}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('p2p.price')} (USD)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="1.00" data-testid="input-offer-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="minLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('p2p.minLimit')}</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" placeholder="10" data-testid="input-offer-min" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('p2p.maxLimit')}</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" placeholder="1000" data-testid="input-offer-max" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="paymentTimeLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('transactions.processingTime')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-offer-payment-time-limit">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(offerEligibility?.allowedPaymentTimeLimits || [15, 30, 45, 60]).map((minutes) => (
                              <SelectItem key={minutes} value={String(minutes)}>{minutes}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="paymentMethodIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('p2p.paymentMethods')}</FormLabel>

                        <div className="space-y-2 rounded-lg border p-3" data-testid="input-offer-payment-methods">
                          {(offerEligibility?.paymentMethods || []).length === 0 && (
                            <p className="text-sm text-muted-foreground">{t('p2p.settings.noPaymentMethods')}</p>
                          )}

                          {(offerEligibility?.paymentMethods || []).map((method) => {
                            const checked = field.value?.includes(method.id) ?? false;
                            return (
                              <label key={method.id} className="flex items-center justify-between gap-3 rounded-md border p-2 cursor-pointer">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) => {
                                      const currentValue = field.value || [];
                                      if (value) {
                                        field.onChange([...currentValue, method.id]);
                                      } else {
                                        field.onChange(currentValue.filter((paymentMethodId) => paymentMethodId !== method.id));
                                      }
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{method.displayLabel?.trim() || method.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {method.displayLabel?.trim() && method.displayLabel.trim() !== method.name
                                        ? `${method.name} - ${method.type}`
                                        : method.type}
                                    </p>
                                  </div>
                                </div>
                                {method.isVerified && <Badge variant="outline">{t('common.verified')}</Badge>}
                              </label>
                            );
                          })}
                        </div>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="terms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('p2p.dispute.descriptionLabel')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder={t('p2p.dispute.additionalDetailsPlaceholder')} data-testid="input-offer-terms" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoReply"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('p2p.settings.autoReplyMessage')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={2} placeholder={t('p2p.settings.autoReplyPlaceholder')} data-testid="input-offer-auto-reply" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="submit"
                      disabled={createOfferMutation.isPending || !offerEligibility?.canCreateOffer || availableOfferCurrencies.length === 0}
                      data-testid="button-submit-offer"
                    >
                      {createOfferMutation.isPending ? t('common.loading') : t('common.submit')}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.yourOffers')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(offerStats.total, numberLocale, 0, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.statusActive')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(offerStats.active, numberLocale, 0, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.statusInactive')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(offerStats.inactive, numberLocale, 0, 0)}</p>
          </div>
        </div>
      </div>

      {sortedOffers.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Plus} title={t('p2p.noMyOffers')} description={t('p2p.noMyOffersDesc')} action={{ label: t('p2p.createFirstOffer'), onClick: () => setIsCreateDialogOpen(true) }} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {sortedOffers.map((offer) => (
              <Card
                key={offer.id}
                className="border-slate-800 bg-slate-950/80 text-slate-100"
                data-testid={`row-my-offer-${offer.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-700 text-slate-100 hover:bg-slate-700">
                          {offer.type === "buy" ? t('p2p.buy') : t('p2p.sell')}
                        </Badge>
                        <Badge className={cn("border", getStatusPillClass(offer.status))}>
                          {getStatusBadge(offer.status).props.children}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{formatFiatRange(offer.minLimit, offer.maxLimit, numberLocale)}</p>
                    </div>

                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="min-h-[40px] min-w-[40px] text-slate-300 hover:bg-slate-800" data-testid={`button-edit-offer-${offer.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="min-h-[40px] min-w-[40px] text-slate-300 hover:bg-slate-800"
                        onClick={() => deleteOfferMutation.mutate(offer.id)}
                        disabled={deleteOfferMutation.isPending}
                        data-testid={`button-delete-offer-${offer.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('common.amount')}</p>
                      <p className="mt-1 font-semibold text-slate-100">{formatAssetAmount(offer.amount, offer.currency, numberLocale)}</p>
                    </div>
                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('p2p.price')}</p>
                      <p className="mt-1 font-semibold text-slate-100">{formatFixedFiat(offer.price, numberLocale)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {offer.paymentMethods.slice(0, 2).map((method) => (
                      <Badge key={method} variant="outline" className="border-slate-700 text-slate-300">
                        {method.replace("_", " ")}
                      </Badge>
                    ))}
                    {offer.paymentMethods.length > 2 && (
                      <Badge variant="outline" className="border-slate-700 text-slate-300">
                        +{formatNumericValue(offer.paymentMethods.length - 2, numberLocale, 0, 0)}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden rounded-xl border border-slate-800 bg-slate-950/80 lg:block">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-300">{t('p2p.type')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.amount')}</TableHead>
                  <TableHead className="text-slate-300">{t('p2p.price')}</TableHead>
                  <TableHead className="text-slate-300">{t('p2p.limit')}</TableHead>
                  <TableHead className="text-slate-300">{t('p2p.paymentMethods')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.status')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOffers.map((offer) => (
                  <TableRow key={offer.id} className="border-slate-800 hover:bg-slate-900/60" data-testid={`row-my-offer-${offer.id}`}>
                    <TableCell>
                      <Badge className="bg-slate-700 text-slate-100 hover:bg-slate-700">
                        {offer.type === "buy" ? t('p2p.buy') : t('p2p.sell')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-100"><span>{formatAssetAmount(offer.amount, offer.currency, numberLocale)}</span></TableCell>
                    <TableCell className="text-slate-100 font-semibold">{formatFixedFiat(offer.price, numberLocale)}</TableCell>
                    <TableCell className="text-slate-300"><span>{formatFiatRange(offer.minLimit, offer.maxLimit, numberLocale)}</span></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {offer.paymentMethods.slice(0, 2).map((method) => (
                          <Badge key={method} variant="outline" className="border-slate-700 text-slate-300">
                            {method.replace("_", " ")}
                          </Badge>
                        ))}
                        {offer.paymentMethods.length > 2 && (
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            +{formatNumericValue(offer.paymentMethods.length - 2, numberLocale, 0, 0)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("border", getStatusPillClass(offer.status))}>
                        {getStatusBadge(offer.status).props.children}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="min-h-[40px] min-w-[40px] text-slate-300 hover:bg-slate-800" data-testid={`button-edit-offer-${offer.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="min-h-[40px] min-w-[40px] text-slate-300 hover:bg-slate-800"
                          onClick={() => deleteOfferMutation.mutate(offer.id)}
                          disabled={deleteOfferMutation.isPending}
                          data-testid={`button-delete-offer-${offer.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function MyTradesTab() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);
  const [outgoingMessage, setOutgoingMessage] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const numberLocale = resolveLanguageLocale(language);

  const { data: trades, isLoading } = useQuery<P2PTrade[]>({
    queryKey: ["/api/p2p/my-trades"],
    refetchInterval: 8000,
  });

  const { data: activeTrade, isLoading: activeTradeLoading } = useQuery<P2PTradeDetails>({
    queryKey: ["/api/p2p/trades", activeTradeId],
    enabled: !!activeTradeId,
    refetchInterval: activeTradeId ? 5000 : false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/p2p/trades/${activeTradeId!}`);
      return res.json();
    },
  });

  const { data: tradeMessages = [], isLoading: tradeMessagesLoading } = useQuery<P2PTradeMessage[]>({
    queryKey: ["/api/p2p/trades", activeTradeId, "messages"],
    enabled: !!activeTradeId,
    refetchInterval: activeTradeId ? 4000 : false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/p2p/trades/${activeTradeId!}/messages`);
      return res.json();
    },
  });

  const { data: tradeLogs = [], isLoading: tradeLogsLoading } = useQuery<P2PTransactionLog[]>({
    queryKey: ["/api/p2p/trades", activeTradeId, "logs"],
    enabled: !!activeTradeId,
    refetchInterval: activeTradeId ? 5000 : false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/p2p/trades/${activeTradeId!}/logs`);
      return res.json();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!activeTradeId) {
        throw new Error(t('common.error'));
      }

      const res = await apiRequest("POST", `/api/p2p/trades/${activeTradeId}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      setOutgoingMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/trades", activeTradeId, "messages"] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const tradeActionMutation = useMutation({
    mutationFn: async (action: "pay" | "confirm" | "complete" | "cancel") => {
      if (!activeTradeId) {
        throw new Error(t('common.error'));
      }

      if (action === "pay") {
        const response = await apiRequestWithPaymentToken(
          "POST",
          `/api/p2p/trades/${activeTradeId}/pay`,
          { paymentReference: paymentReference.trim() || undefined },
          "p2p_trade_pay",
        );
        return response.json();
      }

      if (action === "confirm") {
        const response = await apiRequestWithPaymentToken(
          "POST",
          `/api/p2p/trades/${activeTradeId}/confirm`,
          {},
          "p2p_trade_confirm",
        );
        return response.json();
      }

      if (action === "complete") {
        const response = await apiRequest("POST", `/api/p2p/trades/${activeTradeId}/complete`);
        return response.json();
      }

      const response = await apiRequest("POST", `/api/p2p/trades/${activeTradeId}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/trades", activeTradeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/trades", activeTradeId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/trades", activeTradeId, "logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/p2p/offers"] });
      setCancelReason("");
      toast({
        title: t('common.success'),
        description: t('p2p.tradeProcessing'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openTradeRoom = (tradeId: string) => {
    setActiveTradeId(tradeId);
    setOutgoingMessage("");
    setPaymentReference("");
    setCancelReason("");
  };

  const closeTradeRoom = () => {
    setActiveTradeId(null);
    setOutgoingMessage("");
    setPaymentReference("");
    setCancelReason("");
  };

  const sortedTrades = useMemo(() => {
    return [...(trades || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [trades]);

  const tradeStats = useMemo(() => {
    const counters = {
      total: sortedTrades.length,
      pending: 0,
      completed: 0,
      disputed: 0,
    };

    for (const trade of sortedTrades) {
      if (trade.status === "pending" || trade.status === "paid" || trade.status === "confirmed") {
        counters.pending += 1;
      }
      if (trade.status === "completed") {
        counters.completed += 1;
      }
      if (trade.status === "disputed") {
        counters.disputed += 1;
      }
    }

    return counters;
  }, [sortedTrades]);

  const submitTradeMessage = () => {
    const safeMessage = outgoingMessage.trim();
    if (!safeMessage) {
      return;
    }

    sendMessageMutation.mutate(safeMessage);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      paid: "default",
      confirmed: "default",
      completed: "outline",
      cancelled: "destructive",
      disputed: "destructive",
    };
    const labels: Record<string, string> = {
      pending: t('p2p.tradePending'),
      paid: t('p2p.tradeProcessing'),
      confirmed: t('p2p.tradeProcessing'),
      completed: t('p2p.tradeCompleted'),
      cancelled: t('p2p.tradeCancelled'),
      disputed: t('p2p.tradeDisputed'),
    };
    return <Badge variant={variants[status] || "default"} >{labels[status] || status}</Badge>;
  };

  const getStatusPillClass = (status: string) => {
    if (status === "completed") return "border-emerald-600/40 bg-emerald-600/10 text-emerald-300";
    if (status === "disputed") return "border-amber-600/40 bg-amber-600/10 text-amber-300";
    if (status === "cancelled") return "border-red-600/40 bg-red-600/10 text-red-300";
    if (status === "paid" || status === "confirmed") return "border-sky-600/40 bg-sky-600/10 text-sky-300";
    return "border-slate-700 bg-slate-800 text-slate-200";
  };

  const getTimelineStepState = (tradeStatus: string, step: "pending" | "paid" | "confirmed" | "completed") => {
    const order: Array<"pending" | "paid" | "confirmed" | "completed"> = ["pending", "paid", "confirmed", "completed"];
    const currentIndex = order.indexOf(tradeStatus as "pending" | "paid" | "confirmed" | "completed");
    const stepIndex = order.indexOf(step);

    if (tradeStatus === "cancelled" || tradeStatus === "disputed") {
      return step === "pending" ? "done" : "idle";
    }

    if (currentIndex === -1) {
      return "idle";
    }

    if (currentIndex > stepIndex) return "done";
    if (currentIndex === stepIndex) return "current";
    return "idle";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100">
        <div className="flex items-center justify-between gap-2 bg-[#f0c73f] px-3 py-2 text-slate-900 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <h3 className="text-sm font-semibold sm:text-base">{t('p2p.tradeHistory')}</h3>
          </div>
          <Badge className="bg-slate-900 text-[#f0c73f] hover:bg-slate-900">{formatNumericValue(tradeStats.total, numberLocale, 0, 0)}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.tradeHistory')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(tradeStats.total, numberLocale, 0, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.tradePending')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(tradeStats.pending, numberLocale, 0, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.tradeCompleted')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatNumericValue(tradeStats.completed, numberLocale, 0, 0)}</p>
          </div>
        </div>
      </div>

      {sortedTrades.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={ArrowUpRight} title={t('p2p.noTrades')} description={t('p2p.noTradesDesc')} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {sortedTrades.map((trade) => (
              <Card
                key={trade.id}
                className="border-slate-800 bg-slate-950/80 text-slate-100"
                data-testid={`row-trade-${trade.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold" data-testid={`text-counterparty-${trade.id}`}>{trade.counterpartyUsername}</p>
                      <p className="mt-1 text-xs text-slate-400">#{trade.id.slice(0, 8)}</p>
                    </div>
                    <Badge className={cn("border", getStatusPillClass(trade.status))}>
                      {getStatusBadge(trade.status).props.children}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('common.amount')}</p>
                      <p className="mt-1 font-semibold text-slate-100" data-testid={`text-trade-amount-${trade.id}`}>{trade.amount}</p>
                    </div>
                    <div className="rounded-md bg-slate-900 p-2">
                      <p className="text-xs text-slate-400">{t('p2p.totalPrice')}</p>
                      <p className="mt-1 font-semibold text-slate-100" data-testid={`text-trade-total-${trade.id}`}>${trade.totalPrice || trade.fiatAmount || "0"}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">{formatLocalizedDate(trade.createdAt, numberLocale)}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                      onClick={() => openTradeRoom(trade.id)}
                      data-testid={`button-open-trade-room-${trade.id}`}
                    >
                      <Eye className="me-1 h-4 w-4" />
                      {t('p2p.trade')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden rounded-xl border border-slate-800 bg-slate-950/80 lg:block">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-300">{t('p2p.tradeId')}</TableHead>
                  <TableHead className="text-slate-300">{t('p2p.counterparty')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.amount')}</TableHead>
                  <TableHead className="text-slate-300">{t('p2p.totalPrice')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.status')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.date')}</TableHead>
                  <TableHead className="text-slate-300">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTrades.map((trade) => (
                  <TableRow key={trade.id} className="border-slate-800 hover:bg-slate-900/60" data-testid={`row-trade-${trade.id}`}>
                    <TableCell className="font-mono text-sm text-slate-300" data-testid={`text-trade-id-${trade.id}`}>
                      {trade.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell data-testid={`text-counterparty-${trade.id}`} className="text-slate-100">
                      <span className="truncate block max-w-[180px]">{trade.counterpartyUsername}</span>
                    </TableCell>
                    <TableCell data-testid={`text-trade-amount-${trade.id}`} className="text-slate-100">
                      {trade.amount}
                    </TableCell>
                    <TableCell data-testid={`text-trade-total-${trade.id}`} className="text-slate-100 font-semibold">
                      ${trade.totalPrice || trade.fiatAmount || "0"}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("border", getStatusPillClass(trade.status))}>
                        {getStatusBadge(trade.status).props.children}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {formatLocalizedDate(trade.createdAt, numberLocale)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                        onClick={() => openTradeRoom(trade.id)}
                        data-testid={`button-open-trade-room-${trade.id}`}
                      >
                        {t('p2p.trade')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={Boolean(activeTradeId)} onOpenChange={(open) => { if (!open) closeTradeRoom(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden border-slate-800 bg-slate-950 text-slate-100">
          <DialogHeader className="border-b border-slate-800 pb-3">
            <DialogTitle className="flex items-center gap-2">
              {t('p2p.trade')} {activeTradeId ? `#${activeTradeId.slice(0, 8)}` : ""}
              {activeTrade && (
                <Badge className={cn("border", getStatusPillClass(activeTrade.status))}>
                  {getStatusBadge(activeTrade.status).props.children}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{t('p2p.tradeInitiatedDesc')}</DialogDescription>
          </DialogHeader>

          {activeTradeLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : activeTrade ? (
            <div className="grid max-h-[72vh] grid-cols-1 gap-4 overflow-y-auto py-1 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-[#f0c73f]" />
                      <h4 className="font-medium text-slate-100">{t('p2p.dispute.chat')}</h4>
                    </div>
                    {activeTrade.expiresAt && (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatLocalizedDateTime(activeTrade.expiresAt, numberLocale)}</span>
                      </div>
                    )}
                  </div>
                  <ScrollArea className="h-72 pe-2">
                    {tradeMessagesLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-8" />
                        <Skeleton className="h-8" />
                      </div>
                    ) : tradeMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('p2p.noTradesDesc')}</p>
                    ) : (
                      <div className="space-y-2">
                        {tradeMessages.map((message) => {
                          const isOwnMessage = message.senderId === user?.id;
                          const isSystemMessage = message.isSystemMessage;
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                "flex",
                                isSystemMessage ? "justify-center" : isOwnMessage ? "justify-end" : "justify-start",
                              )}
                            >
                              <div className={cn(
                                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                                isSystemMessage
                                  ? "bg-slate-800 text-slate-400"
                                  : isOwnMessage
                                    ? "bg-[#f0c73f] text-slate-900"
                                    : "bg-slate-800 text-slate-100",
                              )}>
                                {!isSystemMessage && (
                                  <p className="text-xs opacity-80 mb-1">
                                    {message.sender?.username || message.sender?.nickname || t('p2p.trader')}
                                  </p>
                                )}
                                <p>{message.message}</p>
                                <p className="text-[10px] opacity-70 mt-1">
                                  {formatLocalizedTime(message.createdAt, numberLocale)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {activeTrade.status !== "completed" && activeTrade.status !== "cancelled" && (
                  <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                    <Input
                      value={outgoingMessage}
                      onChange={(e) => setOutgoingMessage(e.target.value)}
                      placeholder={t('common.send')}
                      className="border-slate-700 bg-slate-950 text-slate-100"
                      data-testid="input-trade-room-message"
                    />
                    <Button
                      onClick={submitTradeMessage}
                      className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      disabled={sendMessageMutation.isPending || outgoingMessage.trim().length === 0}
                      data-testid="button-send-trade-room-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('p2p.trade')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t('common.amount')}</span>
                      <span className="font-medium">{activeTrade.amount}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t('p2p.totalPrice')}</span>
                      <span className="font-medium">${activeTrade.totalPrice || activeTrade.fiatAmount || "0"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t('p2p.paymentMethod')}</span>
                      <span className="font-medium">{activeTrade.paymentMethod || "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t('p2p.counterparty')}</span>
                      <span className="font-medium">{activeTrade.counterpartyUsername || activeTrade.buyer?.username || activeTrade.seller?.username || "-"}</span>
                    </div>
                    {activeTrade.expiresAt && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{t('common.date')}</span>
                        </span>
                        <span className="font-medium">{formatLocalizedDateTime(activeTrade.expiresAt, numberLocale)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('common.actions')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeTrade.isBuyer && activeTrade.status === "pending" && (
                      <>
                        <Input
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder={t('transactions.paymentReference')}
                          className="border-slate-700 bg-slate-950 text-slate-100"
                          data-testid="input-payment-reference"
                        />
                        <Button
                          className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                          onClick={() => tradeActionMutation.mutate("pay")}
                          disabled={tradeActionMutation.isPending}
                          data-testid="button-trade-action-pay"
                        >
                          {t('p2p.tradeProcessing')}
                        </Button>
                      </>
                    )}

                    {activeTrade.isSeller && activeTrade.status === "paid" && (
                      <Button
                        className="w-full bg-[#f0c73f] text-slate-900 hover:bg-[#f5ce56]"
                        onClick={() => tradeActionMutation.mutate("confirm")}
                        disabled={tradeActionMutation.isPending}
                        data-testid="button-trade-action-confirm"
                      >
                        {t('common.confirm')}
                      </Button>
                    )}

                    {activeTrade.isSeller && activeTrade.status === "confirmed" && (
                      <Button
                        className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        onClick={() => tradeActionMutation.mutate("complete")}
                        disabled={tradeActionMutation.isPending}
                        data-testid="button-trade-action-complete"
                      >
                        {t('p2p.tradeCompleted')}
                      </Button>
                    )}

                    {((activeTrade.isBuyer && activeTrade.status === "pending")
                      || (activeTrade.isSeller && (activeTrade.status === "pending" || activeTrade.status === "paid"))) && (
                        <>
                          <Input
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder={t('p2p.dispute.reason')}
                            className="border-slate-700 bg-slate-950 text-slate-100"
                            data-testid="input-trade-cancel-reason"
                          />
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => tradeActionMutation.mutate("cancel")}
                            disabled={tradeActionMutation.isPending}
                            data-testid="button-trade-action-cancel"
                          >
                            {t('common.cancel')}
                          </Button>
                        </>
                      )}
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('common.status')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(["pending", "paid", "confirmed", "completed"] as const).map((step) => {
                      const state = getTimelineStepState(activeTrade.status, step);
                      return (
                        <div key={step} className="flex items-center gap-2 text-sm">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              state === "done" && "bg-emerald-400",
                              state === "current" && "bg-[#f0c73f]",
                              state === "idle" && "bg-slate-600",
                            )}
                          />
                          <span className={cn(
                            state === "idle" ? "text-slate-400" : "text-slate-100",
                          )}>
                            {getStatusBadge(step).props.children}
                          </span>
                        </div>
                      );
                    })}

                    {(activeTrade.status === "cancelled" || activeTrade.status === "disputed") && (
                      <Badge className={cn("border", getStatusPillClass(activeTrade.status))}>
                        {getStatusBadge(activeTrade.status).props.children}
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('p2p.tradeHistory')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-44 pe-2">
                      {tradeLogsLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-8" />
                          <Skeleton className="h-8" />
                        </div>
                      ) : tradeLogs.length === 0 ? (
                        <p className="text-xs text-slate-400">{t('p2p.noTradesDesc')}</p>
                      ) : (
                        <div className="space-y-2">
                          {tradeLogs.slice(-8).map((log) => (
                            <div key={log.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                              <p className="text-[11px] text-slate-200 leading-5">{log.description}</p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {formatLocalizedDateTime(log.createdAt, numberLocale)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('p2p.noTrades')}</p>
          )}

          <DialogFooter className="border-t border-slate-800 pt-3">
            <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={closeTradeRoom}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const DISPUTE_REASONS = [
  {
    category: 'payment', reasons: [
      { id: 'no_payment', icon: Ban },
      { id: 'underpaid', icon: ArrowDownRight },
      { id: 'overpaid', icon: ArrowUpRight },
      { id: 'payment_pending', icon: Clock },
      { id: 'wrong_payment_method', icon: AlertTriangle },
    ]
  },
  {
    category: 'release', reasons: [
      { id: 'crypto_not_released', icon: Ban },
      { id: 'wrong_amount_released', icon: AlertTriangle },
    ]
  },
  {
    category: 'conduct', reasons: [
      { id: 'unresponsive', icon: Clock },
      { id: 'abusive', icon: Ban },
      { id: 'suspected_fraud', icon: Shield },
    ]
  },
  {
    category: 'compliance', reasons: [
      { id: 'name_mismatch', icon: AlertTriangle },
      { id: 'third_party_payment', icon: AlertTriangle },
      { id: 'chargeback_threat', icon: Ban },
    ]
  },
  {
    category: 'other', reasons: [
      { id: 'system_error', icon: AlertTriangle },
      { id: 'other', icon: MessageSquare },
    ]
  },
];

function DisputesTab() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const numberLocale = resolveLanguageLocale(language);
  const [selectedDispute, setSelectedDispute] = useState<string | null>(null);
  const [showFileDispute, setShowFileDispute] = useState(false);
  const [disputeStep, setDisputeStep] = useState(1);
  const [selectedTrade, setSelectedTrade] = useState<P2PTrade | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const { data: disputes, isLoading: disputesLoading, refetch: refetchDisputes } = useQuery<P2PDispute[]>({
    queryKey: ['/api/p2p/disputes'],
  });

  const { data: trades } = useQuery<P2PTrade[]>({
    queryKey: ['/api/p2p/my-trades'],
  });

  const { data: disputeDetails, refetch: refetchDispute } = useQuery<{
    dispute: P2PDispute;
    messages: P2PDisputeMessage[];
    evidence: P2PDisputeEvidence[];
    logs: P2PTransactionLog[];
  }>({
    queryKey: ['/api/p2p/disputes', selectedDispute],
    enabled: !!selectedDispute,
  });

  const createDisputeMutation = useMutation({
    mutationFn: async (data: { tradeId: string; reason: string; description: string; evidenceFiles?: File[] }) => {
      // 1. Create the dispute
      const disputeRes = await apiRequest("POST", `/api/p2p/disputes`, {
        tradeId: data.tradeId,
        reason: data.reason,
        description: data.description,
      });
      const dispute = await disputeRes.json();
      const disputeId = dispute.id;

      // 2. Upload evidence files if any
      if (data.evidenceFiles && data.evidenceFiles.length > 0) {
        for (const file of data.evidenceFiles) {
          try {
            // Convert file to base64 data URL
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            // Upload to get a URL
            const uploadRes = await apiRequest("POST", `/api/upload`, {
              fileData: base64,
              fileName: file.name,
            });
            const uploaded = await uploadRes.json();

            // Submit as evidence
            await apiRequest("POST", `/api/p2p/disputes/${disputeId}/evidence`, {
              fileName: file.name,
              fileUrl: uploaded.url,
              fileType: uploaded.fileType || file.type,
              fileSize: uploaded.fileSize || file.size,
              description: "",
              evidenceType: file.type.startsWith("image/") ? "screenshot" :
                file.type.startsWith("video/") ? "video" :
                  file.type === "application/pdf" ? "document" : "other",
            });
          } catch (err) {
            console.error(`Failed to upload evidence file: ${file.name}`, err);
          }
        }
      }

      return dispute;
    },
    onSuccess: () => {
      toast({ title: t('p2p.dispute.submitted'), description: t('p2p.dispute.submittedDesc') });
      setShowFileDispute(false);
      resetDisputeForm();
      refetchDisputes();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: "destructive" });
    }
  });

  const respondDisputeMutation = useMutation({
    mutationFn: async (data: { action: string; evidence?: File[]; details?: string }) => {
      return apiRequest("POST", `/api/p2p/disputes/${selectedDispute}/respond`, data);
    },
    onSuccess: () => {
      toast({ title: t('common.success') });
      refetchDispute();
    },
  });

  const resetDisputeForm = () => {
    setDisputeStep(1);
    setSelectedTrade(null);
    setSelectedReason(null);
    setUploadedFiles([]);
    setAdditionalDetails("");
    setAcknowledged(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files).filter((file) => {
        return file.size <= 10 * 1024 * 1024 && isAllowedEvidenceMimeType(file.type);
      });
      setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitDispute = () => {
    if (!selectedTrade || !selectedReason) return;
    createDisputeMutation.mutate({
      tradeId: selectedTrade.id,
      reason: selectedReason,
      description: additionalDetails,
      evidenceFiles: uploadedFiles,
    });
  };

  const eligibleTrades = trades?.filter(t =>
    t.status === 'pending' || t.status === 'paid' || t.status === 'confirmed' || t.status === 'disputed'
  ) || [];

  const sortedDisputes = useMemo(() => {
    return [...(disputes || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [disputes]);

  const disputeStats = useMemo(() => {
    const counters = {
      total: sortedDisputes.length,
      open: 0,
      investigating: 0,
      resolved: 0,
    };

    for (const dispute of sortedDisputes) {
      if (dispute.status === "open") counters.open += 1;
      if (dispute.status === "investigating") counters.investigating += 1;
      if (dispute.status === "resolved") counters.resolved += 1;
    }

    return counters;
  }, [sortedDisputes]);

  const getDisputeStatusPillClass = (status: string) => {
    if (status === "resolved") return "border-emerald-600/40 bg-emerald-600/10 text-emerald-300";
    if (status === "open") return "border-red-600/40 bg-red-600/10 text-red-300";
    if (status === "investigating") return "border-amber-600/40 bg-amber-600/10 text-amber-300";
    return "border-slate-700 bg-slate-800 text-slate-200";
  };

  const getDisputeStagePillClass = (stage: string) => {
    if (stage === "resolved") return "border-emerald-600/40 bg-emerald-600/10 text-emerald-300";
    if (stage === "support_review") return "border-sky-600/40 bg-sky-600/10 text-sky-300";
    return "border-slate-700 bg-slate-800 text-slate-200";
  };

  const getActionBadgeColor = (action: string) => {
    const colors: Record<string, string> = {
      trade_created: "bg-blue-500/20 text-blue-400",
      payment_marked: "bg-yellow-500/20 text-yellow-400",
      payment_confirmed: "bg-green-500/20 text-green-400",
      trade_completed: "bg-green-500/20 text-green-400",
      trade_cancelled: "bg-red-500/20 text-red-400",
      dispute_opened: "bg-orange-500/20 text-orange-400",
      dispute_message: "bg-purple-500/20 text-purple-400",
      evidence_uploaded: "bg-cyan-500/20 text-cyan-400",
      dispute_resolved: "bg-green-500/20 text-green-400",
      escrow_held: "bg-blue-500/20 text-blue-400",
      escrow_released: "bg-green-500/20 text-green-400",
      escrow_returned: "bg-yellow-500/20 text-yellow-400",
    };
    return colors[action] || "bg-muted text-muted-foreground";
  };

  const getTradeStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('p2p.tradePending'),
      paid: t('p2p.tradeProcessing'),
      confirmed: t('p2p.tradeProcessing'),
      completed: t('p2p.tradeCompleted'),
      cancelled: t('p2p.tradeCancelled'),
      disputed: t('p2p.tradeDisputed'),
    };

    return labels[status] || t('common.status');
  };

  const getDisputeActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      trade_created: t('p2p.trade'),
      payment_marked: t('p2p.tradeProcessing'),
      payment_confirmed: t('common.confirm'),
      trade_completed: t('p2p.tradeCompleted'),
      trade_cancelled: t('p2p.tradeCancelled'),
      dispute_opened: t('p2p.dispute.fileDispute'),
      dispute_message: t('p2p.dispute.chat'),
      evidence_uploaded: t('p2p.dispute.uploadEvidence'),
      dispute_resolved: t('p2p.dispute.status.resolved'),
      escrow_held: t('p2p.tradeProcessing'),
      escrow_released: t('p2p.tradeCompleted'),
      escrow_returned: t('p2p.tradeCancelled'),
    };

    return labels[action] || t('common.actions');
  };

  if (disputesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (showFileDispute) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100">
          <div className="flex items-center justify-between gap-2 bg-[#f0c73f] px-3 py-2 text-slate-900 sm:px-4 sm:py-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-slate-900 hover:bg-black/10"
              onClick={() => { setShowFileDispute(false); resetDisputeForm(); }}
            >
              <ChevronRight className="h-4 w-4 rotate-180 me-1" />
              {t('common.back')}
            </Button>
            <h3 className="font-semibold">{t('p2p.dispute.fileDispute')}</h3>
            <Badge className="bg-slate-900 text-[#f0c73f] hover:bg-slate-900">{disputeStep}/3</Badge>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 mb-6">
          {[
            { step: 1, label: t('p2p.dispute.stepReason'), icon: AlertTriangle },
            { step: 2, label: t('p2p.dispute.stepEvidence'), icon: Upload },
            { step: 3, label: t('p2p.dispute.stepConfirm'), icon: Check }
          ].map(({ step, label, icon: Icon }) => (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors",
                  disputeStep >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium text-center",
                  disputeStep >= step ? "text-primary" : "text-muted-foreground"
                )}>{label}</span>
              </div>
              {step < 3 && <div className={cn("w-8 sm:w-16 h-0.5 mx-1 sm:mx-2", disputeStep > step ? "bg-primary" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {disputeStep === 1 && (
          <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.dispute.selectReason')}</CardTitle>
              <CardDescription>{t('p2p.dispute.selectReasonDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selectedTrade && (
                <div className="space-y-3">
                  <Label>{t('p2p.myTrades')}</Label>
                  {eligibleTrades.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('p2p.noTrades')}</p>
                  ) : (
                    <div className="space-y-2">
                      {eligibleTrades.map(trade => (
                        <div
                          key={trade.id}
                          className="p-3 border rounded-lg cursor-pointer hover-elevate"
                          onClick={() => setSelectedTrade(trade)}
                          data-testid={`select-trade-${trade.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{trade.amount} - ${trade.totalPrice}</p>
                              <p className="text-sm text-muted-foreground">{t('p2p.dispute.with')} {trade.counterpartyUsername}</p>
                            </div>
                            <Badge variant="outline">{getTradeStatusLabel(trade.status)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedTrade && (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">{t('p2p.myTrades')}</p>
                    <p className="font-medium">{selectedTrade.amount} - ${selectedTrade.totalPrice} {t('p2p.dispute.with')} {selectedTrade.counterpartyUsername}</p>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedTrade(null)}>
                      {t('common.change')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {DISPUTE_REASONS.map(category => (
                      <div key={category.category}>
                        <h4 className="font-medium mb-2 text-sm text-muted-foreground">
                          {t(`p2p.dispute.category.${category.category}`)}
                        </h4>
                        <div className="grid gap-2">
                          {category.reasons.map(reason => {
                            const Icon = reason.icon;
                            const isSelected = selectedReason === reason.id;
                            return (
                              <div
                                key={reason.id}
                                className={cn(
                                  "p-3 border rounded-lg cursor-pointer transition-colors",
                                  isSelected ? "border-primary bg-primary/10" : "hover-elevate"
                                )}
                                onClick={() => setSelectedReason(reason.id)}
                                data-testid={`reason-${reason.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <Icon className={cn("h-5 w-5 mt-0.5", isSelected ? "text-primary" : "text-muted-foreground")} />
                                  <div className="flex-1">
                                    <p className="font-medium">{t(`p2p.dispute.reason.${reason.id}`)}</p>
                                    <p className="text-sm text-muted-foreground">{t(`p2p.dispute.reason.${reason.id}_desc`)}</p>
                                  </div>
                                  {isSelected && <Check className="h-5 w-5 text-primary" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => setDisputeStep(2)}
                  disabled={!selectedTrade || !selectedReason}
                  data-testid="button-next-step"
                >
                  {t('common.next')}
                  <ChevronRight className="h-4 w-4 ms-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {disputeStep === 2 && (
          <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.dispute.uploadEvidence')}</CardTitle>
              <CardDescription>{t('p2p.dispute.uploadEvidenceDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById('evidence-upload')?.click()}
              >
                <input
                  id="evidence-upload"
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,.pdf"
                  multiple
                  onChange={handleFileSelect}
                  data-testid="input-evidence-files"
                />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">{t('p2p.dispute.dragDropFiles')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('p2p.dispute.supportedFormats')}</p>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {uploadedFiles.map((file, index) => {
                    const isPreviewImage = canPreviewImageFile(file.type);
                    const previewUrl = isPreviewImage ? URL.createObjectURL(file) : null;
                    const safeFileName = sanitizeDisplayText(file.name);
                    return (
                      <div key={index} className="relative group border rounded-lg overflow-hidden">
                        {isPreviewImage && previewUrl ? (
                          <div className="aspect-video bg-muted">
                            <img
                              src={previewUrl}
                              alt={safeFileName}
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onLoad={() => URL.revokeObjectURL(previewUrl)}
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-muted flex items-center justify-center">
                            {file.type.startsWith('video/') ? (
                              <Video className="h-8 w-8 text-muted-foreground" />
                            ) : (
                              <FileCheck className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        <div className="p-2 bg-background">
                          <p className="text-xs font-medium truncate">{safeFileName}</p>
                          <p className="text-xs text-muted-foreground">{formatNumericValue(file.size / 1024 / 1024, numberLocale, 2, 2)} MB</p>
                        </div>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 end-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeFile(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('p2p.dispute.additionalDetails')}</Label>
                <Textarea
                  value={additionalDetails}
                  onChange={(e) => setAdditionalDetails(e.target.value)}
                  placeholder={t('p2p.dispute.additionalDetailsPlaceholder')}
                  className="min-h-[100px]"
                  data-testid="input-additional-details"
                />
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setDisputeStep(1)}>
                  <ChevronRight className="h-4 w-4 rotate-180 me-1" />
                  {t('common.back')}
                </Button>
                <Button onClick={() => setDisputeStep(3)} data-testid="button-next-step-2">
                  {t('common.next')}
                  <ChevronRight className="h-4 w-4 ms-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {disputeStep === 3 && (
          <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">{t('p2p.dispute.confirmSubmit')}</CardTitle>
              <CardDescription>{t('p2p.dispute.confirmSubmitDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('p2p.dispute.tradeInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('p2p.dispute.tradeAmount')}</span>
                      <span className="font-medium">{selectedTrade?.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('p2p.dispute.fiatAmount')}</span>
                      <span className="font-medium">${selectedTrade?.totalPrice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('p2p.dispute.counterparty')}</span>
                      <span className="font-medium">{selectedTrade?.counterpartyUsername}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('p2p.dispute.disputeReason')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">{selectedReason && t(`p2p.dispute.reason.${selectedReason}`)}</p>
                        <p className="text-sm text-muted-foreground">{selectedReason && t(`p2p.dispute.reason.${selectedReason}_desc`)}</p>
                      </div>
                    </div>
                    {additionalDetails && (
                      <div className="mt-3">
                        <p className="text-sm text-muted-foreground mb-1">{t('p2p.dispute.additionalDetails')}</p>
                        <p className="text-sm p-2 bg-muted rounded-lg">{additionalDetails}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {uploadedFiles.length > 0 && (
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{t('p2p.dispute.evidence')} ({uploadedFiles.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {uploadedFiles.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                            {file.type.startsWith('image/') ? (
                              <Camera className="h-4 w-4 text-primary" />
                            ) : file.type.startsWith('video/') ? (
                              <Video className="h-4 w-4 text-primary" />
                            ) : (
                              <FileCheck className="h-4 w-4 text-primary" />
                            )}
                            <span className="truncate max-w-32">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="acknowledge"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1"
                  data-testid="checkbox-acknowledge"
                />
                <Label htmlFor="acknowledge" className="text-sm cursor-pointer">
                  {t('p2p.dispute.acknowledgement')}
                </Label>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setDisputeStep(2)}>
                  <ChevronRight className="h-4 w-4 rotate-180 me-1" />
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleSubmitDispute}
                  disabled={!acknowledged || createDisputeMutation.isPending}
                  data-testid="button-submit-dispute"
                >
                  {createDisputeMutation.isPending ? t('p2p.dispute.submitting') : t('p2p.dispute.submitDispute')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100">
        <div className="flex items-center justify-between gap-2 bg-[#f0c73f] px-3 py-2 text-slate-900 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <h3 className="text-sm font-semibold sm:text-base">{t('p2p.dispute.title')}</h3>
          </div>

          <Button
            className="h-8 bg-slate-900 text-[#f0c73f] hover:bg-slate-900/90"
            onClick={() => setShowFileDispute(true)}
            data-testid="button-file-dispute"
          >
            <Plus className="h-4 w-4 me-1" />
            {t('p2p.dispute.fileDispute')}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.dispute.status.open')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{disputeStats.open}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.dispute.status.investigating')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{disputeStats.investigating}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-[11px] text-slate-400 sm:text-xs">{t('p2p.dispute.status.resolved')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{disputeStats.resolved}</p>
          </div>
        </div>
      </div>

      {!selectedDispute ? (
        <>
          {sortedDisputes.length > 0 ? (
            <div className="space-y-3">
              {sortedDisputes.map((dispute) => (
                <Card
                  key={dispute.id}
                  className="cursor-pointer border-slate-800 bg-slate-950/80 text-slate-100 transition-colors hover:bg-slate-900/70"
                  onClick={() => setSelectedDispute(dispute.id)}
                  data-testid={`card-dispute-${dispute.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
                          <AlertTriangle className="h-5 w-5 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t('p2p.dispute.with')} {dispute.respondentName}</p>
                          <p className="text-sm text-slate-300 truncate">
                            {t(`p2p.dispute.reason.${dispute.reason}`)} - {dispute.tradeAmount}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("border", getDisputeStatusPillClass(dispute.status))}>
                          {t(`p2p.dispute.status.${dispute.status}`)}
                        </Badge>
                        <Badge className={cn("border", getDisputeStagePillClass(dispute.stage))}>{t(`p2p.dispute.stage.${dispute.stage}`)}</Badge>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent>
                <EmptyState icon={Scale} title={t('p2p.dispute.noDisputes')} action={{ label: t('p2p.dispute.fileDispute'), onClick: () => setShowFileDispute(true) }} />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
            onClick={() => setSelectedDispute(null)}
            data-testid="button-back-disputes"
          >
            <ChevronRight className="h-4 w-4 rotate-180 me-1" />
            {t('common.back')}
          </Button>

          {disputeDetails && (
            <>
              <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                      {t('p2p.dispute.details')}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge className={cn("border", getDisputeStatusPillClass(disputeDetails.dispute.status))}>
                        {t(`p2p.dispute.status.${disputeDetails.dispute.status}`)}
                      </Badge>
                      <Badge className={cn("border", getDisputeStagePillClass(disputeDetails.dispute.stage))}>{t(`p2p.dispute.stage.${disputeDetails.dispute.stage}`)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 text-sm">
                    <div className="min-w-0">
                      <span className="text-slate-400">{t('p2p.dispute.tradeAmount')}:</span>
                      <span className="ms-2 font-medium">{disputeDetails.dispute.tradeAmount}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400">{t('p2p.dispute.fiatAmount')}:</span>
                      <span className="ms-2 font-medium">{disputeDetails.dispute.tradeFiatAmount}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400">{t('p2p.dispute.reason')}:</span>
                      <span className="ms-2 font-medium">{t(`p2p.dispute.reason.${disputeDetails.dispute.reason}`)}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400">{t('p2p.dispute.counterparty')}:</span>
                      <span className="ms-2 font-medium">{disputeDetails.dispute.respondentName}</span>
                    </div>
                  </div>
                  <Separator className="bg-slate-800" />
                  <div>
                    <span className="text-slate-400 text-sm">{t('p2p.dispute.descriptionLabel')}:</span>
                    <p className="mt-1">{disputeDetails.dispute.description}</p>
                  </div>
                </CardContent>
              </Card>

              {disputeDetails.dispute.respondentId === user?.id && disputeDetails.dispute.status === 'open' && (
                <Card className="border-amber-500/30 bg-amber-500/5 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                      {t('p2p.dispute.respondToDispute')}
                    </CardTitle>
                    <CardDescription>{t('p2p.dispute.respondDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      <div
                        className="cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 transition-colors hover:bg-emerald-500/15"
                        onClick={() => respondDisputeMutation.mutate({ action: 'accept' })}
                        data-testid="button-accept-dispute"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-green-500/20">
                            <Check className="h-5 w-5 text-green-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{t('p2p.dispute.acceptDispute')}</p>
                            <p className="text-sm text-muted-foreground">{t('p2p.dispute.acceptDisputeDesc')}</p>
                          </div>
                        </div>
                      </div>

                      <div
                        className="cursor-pointer rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 transition-colors hover:bg-sky-500/15"
                        onClick={() => respondDisputeMutation.mutate({ action: 'contest' })}
                        data-testid="button-contest-dispute"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-blue-500/20">
                            <Shield className="h-5 w-5 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{t('p2p.dispute.contestDispute')}</p>
                            <p className="text-sm text-muted-foreground">{t('p2p.dispute.contestDisputeDesc')}</p>
                          </div>
                        </div>
                      </div>

                      <div
                        className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
                        onClick={() => respondDisputeMutation.mutate({ action: 'escalate' })}
                        data-testid="button-escalate-dispute"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-orange-500/20">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{t('p2p.dispute.escalateToSupport')}</p>
                            <p className="text-sm text-muted-foreground">{t('p2p.dispute.escalateDesc')}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {respondDisputeMutation.isPending && (
                      <div className="flex items-center justify-center p-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      {t('p2p.dispute.evidence')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      {disputeDetails.evidence.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">{t('p2p.dispute.noEvidence')}</p>
                      ) : (
                        <div className="space-y-2">
                          {disputeDetails.evidence.map((ev) => (
                            (() => {
                              const safeFileUrl = normalizeSafeEvidenceUrl(ev.fileUrl);
                              return (
                                <div key={ev.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/70 p-2">
                                  <div className="flex items-center gap-2">
                                    {ev.fileType.startsWith('image/') ? (
                                      <Camera className="h-4 w-4 text-primary" />
                                    ) : ev.fileType.startsWith('video/') ? (
                                      <Video className="h-4 w-4 text-primary" />
                                    ) : (
                                      <FileCheck className="h-4 w-4 text-primary" />
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">{ev.fileName}</p>
                                      <p className="text-xs text-slate-400">
                                        {ev.uploaderName} - {formatLocalizedDateTime(ev.createdAt, numberLocale)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {ev.isVerified && (
                                      <Badge className="border border-emerald-600/40 bg-emerald-600/10 text-xs text-emerald-300">
                                        <Check className="h-3 w-3 me-1" />
                                        {t('p2p.dispute.verified')}
                                      </Badge>
                                    )}
                                    <Button variant="ghost" size="icon" className="text-slate-200 hover:bg-slate-800" asChild disabled={!safeFileUrl}>
                                      {safeFileUrl ? (
                                        <a href={safeFileUrl} target="_blank" rel="noopener noreferrer">
                                          <Eye className="h-4 w-4" />
                                        </a>
                                      ) : (
                                        <span>
                                          <Eye className="h-4 w-4" />
                                        </span>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="h-4 w-4" />
                      {t('p2p.dispute.transactionLog')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      {disputeDetails.logs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">{t('p2p.dispute.noLogs')}</p>
                      ) : (
                        <div className="space-y-2">
                          {disputeDetails.logs.map((log) => (
                            <div key={log.id} className="flex items-start gap-3 border-s-2 border-primary/30 bg-slate-900/70 p-2 ps-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className={cn("text-xs", getActionBadgeColor(log.action))}>
                                    {getDisputeActionLabel(log.action)}
                                  </Badge>
                                  <span className="text-xs text-slate-400">
                                    {formatLocalizedDateTime(log.createdAt, numberLocale)}
                                  </span>
                                </div>
                                <p className="text-sm">
                                  {language === 'ar' && log.descriptionAr ? log.descriptionAr : log.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function P2PPage() {
  const { t, dir } = useI18n();

  return (
    <div className="overflow-x-hidden p-2 md:p-3" dir={dir}>
      <div className="mb-4 flex items-start justify-between gap-2 sm:gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-p2p-title">{t('nav.p2p')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('p2p.description')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/p2p/profile/me">
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" data-testid="button-p2p-profile">
              <User className="h-4 w-4 sm:me-2" />
              <span className="hidden sm:inline">{t('p2p.profile.myProfile')}</span>
            </Button>
          </Link>
          <Link href="/p2p/settings">
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" data-testid="button-p2p-settings">
              <Settings className="h-4 w-4 sm:me-2" />
              <span className="hidden sm:inline">{t('p2p.settings.title')}</span>
            </Button>
          </Link>
        </div>
      </div>

      <div>
        <div className="pt-2">
          <Tabs defaultValue="marketplace">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="marketplace" data-testid="tab-marketplace">
                {t('p2p.marketplace')}
              </TabsTrigger>
              <TabsTrigger value="my-offers" data-testid="tab-my-offers">
                {t('p2p.myOffers')}
              </TabsTrigger>
              <TabsTrigger value="my-trades" data-testid="tab-my-trades">
                {t('p2p.myTrades')}
              </TabsTrigger>
              <TabsTrigger value="disputes" data-testid="tab-disputes">
                <Scale className="h-4 w-4 me-1" />
                {t('p2p.disputes')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="marketplace">
              <MarketplaceTab />
            </TabsContent>

            <TabsContent value="my-offers">
              <MyOffersTab />
            </TabsContent>

            <TabsContent value="my-trades">
              <MyTradesTab />
            </TabsContent>

            <TabsContent value="disputes">
              <DisputesTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
