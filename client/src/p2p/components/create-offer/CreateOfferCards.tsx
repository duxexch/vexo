import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus } from "lucide-react";

const MAX_NEGOTIATED_ADMIN_FEE_RATE = 0.2;
const DIGITAL_OFFER_DEFAULT_MIN_LIMIT = "1.00";
const DIGITAL_OFFER_DEFAULT_MAX_LIMIT = "100000.00";
const DIGITAL_OFFER_DEFAULT_AMOUNT = "100";
const DIGITAL_OFFER_DEFAULT_PRICE = "1.00";
const DIGITAL_OFFER_DEFAULT_PAYMENT_TIME_LIMIT = "15";

export type CreateOfferDealKind = "standard_asset" | "digital_product";
type CreateOfferType = "buy" | "sell";
type CreateOfferVisibility = "public" | "private_friend";
type ExecutionMode = "instant" | "negotiated";

interface FriendUser {
    id: string;
    username?: string | null;
    nickname?: string | null;
    accountId?: string | null;
}

interface OfferEligibility {
    canCreateOffer: boolean;
    reasons: string[];
    paymentMethods: Array<{
        id: string;
        type: string;
        name: string;
        displayLabel?: string | null;
        isVerified: boolean;
    }>;
    minTradeAmount?: string;
    maxTradeAmount?: string;
    allowedCurrencies: string[];
    allowedBuyCurrencies?: string[];
    allowedSellCurrencies?: string[];
    allowedPaymentTimeLimits: number[];
}

interface CreateOfferCardsProps {
    onCreated?: () => void;
    initialDealKind?: CreateOfferDealKind | null;
}

export function CreateOfferCards({ onCreated, initialDealKind }: CreateOfferCardsProps) {
    const { t } = useI18n();
    const { user } = useAuth();
    const { toast } = useToast();
    const [createState, setCreateState] = useState<{
        isOpen: boolean;
        dealKind: CreateOfferDealKind | null;
        status: "idle" | "editing" | "submitting" | "success" | "error";
    }>({ isOpen: false, dealKind: null, status: "idle" });

    const [type, setType] = useState<CreateOfferType>("sell");
    const [visibility, setVisibility] = useState<CreateOfferVisibility>("public");
    const [targetUserId, setTargetUserId] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [fiatCurrency, setFiatCurrency] = useState("USD");
    const [amount, setAmount] = useState("");
    const [price, setPrice] = useState("");
    const [minLimit, setMinLimit] = useState("");
    const [maxLimit, setMaxLimit] = useState("");
    const [paymentMethodIds, setPaymentMethodIds] = useState<string[]>([]);
    const [paymentTimeLimit, setPaymentTimeLimit] = useState(DIGITAL_OFFER_DEFAULT_PAYMENT_TIME_LIMIT);
    const [terms, setTerms] = useState("");
    const [autoReply, setAutoReply] = useState("");

    const [digitalProductType, setDigitalProductType] = useState("");
    const [executionMode, setExecutionMode] = useState<ExecutionMode>("instant");
    const [exchangeOffered, setExchangeOffered] = useState("");
    const [exchangeRequested, setExchangeRequested] = useState("");
    const [supportMediationRequested, setSupportMediationRequested] = useState(false);
    const [requestedAdminFeePercentage, setRequestedAdminFeePercentage] = useState("");

    const { data: offerEligibility } = useQuery<OfferEligibility>({
        queryKey: ["/api/p2p/offer-eligibility"],
    });

    const { data: friends = [] } = useQuery<FriendUser[]>({
        queryKey: ["/api/users/friends"],
    });

    const { data: digitalProductTypes = [] } = useQuery<string[]>({
        queryKey: ["/api/p2p/digital-product-types"],
    });

    const resetDraft = (dealKind: CreateOfferDealKind) => {
        const availableCurrencies = getAvailableCurrencies(dealKind);
        setType("sell");
        setVisibility("public");
        setTargetUserId("");
        setCurrency(availableCurrencies[0] || "USD");
        setFiatCurrency(offerEligibility?.allowedCurrencies?.[0] || "USD");
        setAmount(dealKind === "digital_product" ? DIGITAL_OFFER_DEFAULT_AMOUNT : "");
        setPrice(dealKind === "digital_product" ? DIGITAL_OFFER_DEFAULT_PRICE : "");
        setMinLimit(String(offerEligibility?.minTradeAmount || DIGITAL_OFFER_DEFAULT_MIN_LIMIT));
        setMaxLimit(String(offerEligibility?.maxTradeAmount || DIGITAL_OFFER_DEFAULT_MAX_LIMIT));
        setPaymentMethodIds([]);
        setPaymentTimeLimit(DIGITAL_OFFER_DEFAULT_PAYMENT_TIME_LIMIT);
        setTerms("");
        setAutoReply("");

        setDigitalProductType("");
        setExecutionMode("instant");
        setExchangeOffered("");
        setExchangeRequested("");
        setSupportMediationRequested(false);
        setRequestedAdminFeePercentage("");
    };

    const openCreateOffer = (dealKind: CreateOfferDealKind) => {
        resetDraft(dealKind);
        setCreateState({ isOpen: true, dealKind, status: "editing" });
    };

    useEffect(() => {
        if (!initialDealKind || createState.isOpen) {
            return;
        }

        openCreateOffer(initialDealKind);
    }, [initialDealKind, createState.isOpen]);

    const closeCreateOffer = () => {
        setCreateState({ isOpen: false, dealKind: null, status: "idle" });
    };

    const getAvailableCurrencies = (dealKind: CreateOfferDealKind) => {
        const fallbackCurrencies = offerEligibility?.allowedCurrencies || ["USD", "USDT", "EUR", "GBP", "SAR", "AED", "EGP"];
        if (dealKind === "digital_product") {
            return offerEligibility?.allowedCurrencies || fallbackCurrencies;
        }
        return type === "buy"
            ? (offerEligibility?.allowedBuyCurrencies || fallbackCurrencies)
            : (offerEligibility?.allowedSellCurrencies || fallbackCurrencies);
    };

    useEffect(() => {
        if (!createState.isOpen || !createState.dealKind) return;
        const available = getAvailableCurrencies(createState.dealKind);
        if (available.length > 0 && !available.includes(currency)) {
            setCurrency(available[0]);
        }
    }, [createState.isOpen, createState.dealKind, currency, offerEligibility?.allowedBuyCurrencies, offerEligibility?.allowedSellCurrencies, offerEligibility?.allowedCurrencies, type]);

    useEffect(() => {
        if (createState.dealKind !== "digital_product") return;
        if (executionMode === "instant") {
            setSupportMediationRequested(false);
            setRequestedAdminFeePercentage("");
        }
    }, [createState.dealKind, executionMode]);

    const createOfferMutation = useMutation({
        mutationFn: async () => {
            if (!createState.dealKind) {
                throw new Error("Deal kind is required");
            }

            const payload: Record<string, unknown> = {
                type,
                dealKind: createState.dealKind,
                visibility,
                targetUserId: visibility === "private_friend" ? targetUserId : undefined,
                amount,
                price,
                currency,
                fiatCurrency,
                minLimit,
                maxLimit,
                paymentMethodIds,
                paymentTimeLimit: Number(paymentTimeLimit),
                terms: terms.trim(),
                autoReply: autoReply.trim(),
            };

            if (createState.dealKind === "digital_product") {
                payload.executionMode = executionMode;
                payload.digitalProductType = digitalProductType.trim();
                payload.exchangeOffered = exchangeOffered.trim();
                payload.exchangeRequested = exchangeRequested.trim();
                payload.supportMediationRequested = supportMediationRequested;
                payload.requestedAdminFeePercentage = requestedAdminFeePercentage.trim() || undefined;
            }

            const response = await apiRequest("POST", "/api/p2p/offers", payload);
            return response.json();
        },
        onMutate: () => {
            setCreateState((previous) => ({ ...previous, status: "submitting" }));
        },
        onSuccess: () => {
            setCreateState((previous) => ({ ...previous, status: "success" }));
            toast({
                title: t("common.success"),
                description: t("p2p.offerCreated"),
            });
            onCreated?.();
            closeCreateOffer();
        },
        onError: (error: Error) => {
            setCreateState((previous) => ({ ...previous, status: "error" }));
            toast({
                title: t("common.error"),
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const currentDealKind = createState.dealKind;
    const availableCurrencies = currentDealKind ? getAvailableCurrencies(currentDealKind) : [];
    const isDigital = currentDealKind === "digital_product";
    const canSubmit = Boolean(currentDealKind)
        && type.trim().length > 0
        && visibility.trim().length > 0
        && currency.trim().length > 0
        && fiatCurrency.trim().length > 0
        && amount.trim().length > 0
        && price.trim().length > 0
        && paymentMethodIds.length > 0
        && terms.trim().length > 0
        && autoReply.trim().length > 0
        && (!isDigital || (digitalProductType.trim().length > 0 && exchangeOffered.trim().length > 0 && exchangeRequested.trim().length > 0))
        && (!isDigital || executionMode === "instant" || requestedAdminFeePercentage.trim().length >= 0);

    const friendOptions = useMemo(() => {
        return friends.map((friend) => {
            const label = friend.nickname || friend.username || friend.accountId || friend.id;
            const suffix = friend.accountId ? `@${friend.accountId}` : friend.username ? `@${friend.username}` : "";
            return {
                id: friend.id,
                label: `${label}${suffix ? ` ${suffix}` : ""}`,
            };
        });
    }, [friends]);

    return (
        <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
                    <CardHeader>
                        <CardTitle>{t("p2p.createStandardOffer")}</CardTitle>
                        <CardDescription>{t("p2p.intent.standardOfferDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-slate-400">{t("p2p.intent.standardOfferHelp")}</p>
                        <Button type="button" className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => openCreateOffer("standard_asset")} data-testid="button-open-standard-create">
                            {t("p2p.startStandardCreate")}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-950/80 text-slate-100">
                    <CardHeader>
                        <CardTitle>{t("p2p.createDigitalOffer")}</CardTitle>
                        <CardDescription>{t("p2p.intent.digitalOfferDesc")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-slate-400">{t("p2p.intent.digitalOfferHelp")}</p>
                        <Button type="button" className="w-full bg-sky-500 text-slate-950 hover:bg-sky-400" onClick={() => openCreateOffer("digital_product")} data-testid="button-open-digital-create">
                            {t("p2p.startDigitalCreate")}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Dialog
                open={createState.isOpen}
                onOpenChange={(open) => {
                    if (!open) closeCreateOffer();
                }}
            >
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{createState.dealKind === "digital_product" ? t("p2p.createDigitalOffer") : t("p2p.createStandardOffer")}</DialogTitle>
                        <DialogDescription>{t("p2p.createOfferDesc")}</DialogDescription>
                    </DialogHeader>

                    {offerEligibility && !offerEligibility.canCreateOffer && (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                            <div className="mb-2 flex items-center gap-2 text-amber-200">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="font-medium">{t("common.error")}</span>
                            </div>
                            <div className="space-y-1 text-amber-100/90">
                                {offerEligibility.reasons.map((reason, idx) => (
                                    <p key={idx}>{reason}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className={cn("font-medium", createState.status === "editing" ? "text-foreground" : "text-muted-foreground")}>{t("p2p.createOffer.status.editing")}</span>
                            <span className={cn("font-medium", createState.status === "submitting" ? "text-foreground" : "text-muted-foreground")}>{t("p2p.createOffer.status.submitting")}</span>
                            <span className={cn("font-medium", createState.status === "success" ? "text-foreground" : "text-muted-foreground")}>{t("p2p.createOffer.status.success")}</span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{t("p2p.type")}</Label>
                                <Select value={type} onValueChange={(value) => setType(value as CreateOfferType)}>
                                    <SelectTrigger data-testid="select-offer-type">
                                        <SelectValue placeholder={t("p2p.selectType")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="buy">{t("p2p.buy")}</SelectItem>
                                        <SelectItem value="sell">{t("p2p.sell")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("challenges.visibility")}</Label>
                                <Select value={visibility} onValueChange={(value) => setVisibility(value as CreateOfferVisibility)}>
                                    <SelectTrigger data-testid="select-offer-visibility">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="public">{t("p2p.visibility.public")}</SelectItem>
                                        <SelectItem value="private_friend">{t("p2p.visibility.privateFriend")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {visibility === "private_friend" && (
                            <div className="space-y-2">
                                <Label>{t("multiplayer.selectFriend")}</Label>
                                <Select value={targetUserId} onValueChange={setTargetUserId}>
                                    <SelectTrigger data-testid="select-offer-target-friend">
                                        <SelectValue placeholder={t("multiplayer.selectFriend")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {friendOptions.length === 0 ? (
                                            <SelectItem value="none" disabled>{t("friends.noFriends")}</SelectItem>
                                        ) : (
                                            friendOptions.map((friend) => (
                                                <SelectItem key={friend.id} value={friend.id}>
                                                    {friend.label}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {currentDealKind === "digital_product" && (
                            <div className="space-y-4 rounded-lg border border-sky-300/40 bg-sky-50/40 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                                <div className="space-y-2">
                                    <Label>{t("p2p.executionMode")}</Label>
                                    <Select value={executionMode} onValueChange={(value) => setExecutionMode(value as ExecutionMode)}>
                                        <SelectTrigger data-testid="select-offer-execution-mode">
                                            <SelectValue placeholder={t("p2p.executionMode")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="instant">{t("p2p.executionMode.instant")}</SelectItem>
                                            <SelectItem value="negotiated">{t("p2p.executionMode.negotiated")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {executionMode === "instant" && (
                                    <div className="rounded-md border border-emerald-300/50 bg-emerald-50/40 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                                        {t("p2p.executionMode.instantDescription")}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>{t("p2p.digitalProductType")}</Label>
                                        <Input
                                            value={digitalProductType}
                                            onChange={(event) => setDigitalProductType(event.target.value)}
                                            list="digital-product-type-options"
                                            placeholder={t("p2p.digitalProductType")}
                                            data-testid="input-offer-digital-product-type"
                                        />
                                        <datalist id="digital-product-type-options">
                                            {digitalProductTypes.map((productType) => (
                                                <option key={productType} value={productType} />
                                            ))}
                                        </datalist>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>{t("wallet.commission")}</Label>
                                        <MoneyInput
                                            value={requestedAdminFeePercentage}
                                            onChange={(event) => setRequestedAdminFeePercentage(event.target.value)}
                                            placeholder={`0 - ${MAX_NEGOTIATED_ADMIN_FEE_RATE}`}
                                            data-testid="input-offer-requested-admin-fee"
                                            disabled={executionMode === "instant"}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>{t("p2p.offer.exchangeOfferedShort") || t("p2p.buy")}</Label>
                                        <Input
                                            value={exchangeOffered}
                                            onChange={(event) => setExchangeOffered(event.target.value)}
                                            placeholder={t("p2p.offer.exchangeOfferedShort") || t("p2p.buy")}
                                            data-testid="input-offer-exchange-offered"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>{t("p2p.offer.exchangeRequestedShort") || t("p2p.sell")}</Label>
                                        <Input
                                            value={exchangeRequested}
                                            onChange={(event) => setExchangeRequested(event.target.value)}
                                            placeholder={t("p2p.offer.exchangeRequestedShort") || t("p2p.sell")}
                                            data-testid="input-offer-exchange-requested"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                                    <span>{t("p2p.dispute.support")}</span>
                                    <Switch
                                        checked={supportMediationRequested}
                                        onCheckedChange={setSupportMediationRequested}
                                        data-testid="switch-offer-support-mediation"
                                        disabled={executionMode === "instant"}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{t("common.currency")}</Label>
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger data-testid="select-offer-currency">
                                        <SelectValue placeholder={t("p2p.currency")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCurrencies.map((supportedCurrency) => (
                                            <SelectItem key={supportedCurrency} value={supportedCurrency}>
                                                {supportedCurrency}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("settings.currency")}</Label>
                                <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                                    <SelectTrigger data-testid="select-offer-fiat-currency">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(offerEligibility?.allowedCurrencies || ["USD"]).map((supportedCurrency) => (
                                            <SelectItem key={supportedCurrency} value={supportedCurrency}>
                                                {supportedCurrency}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("common.amount")}</Label>
                                <MoneyInput
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                    placeholder={currentDealKind === "digital_product" ? DIGITAL_OFFER_DEFAULT_AMOUNT : "100"}
                                    data-testid="input-offer-amount"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>{t("p2p.price")}</Label>
                                <MoneyInput
                                    value={price}
                                    onChange={(event) => setPrice(event.target.value)}
                                    placeholder={currentDealKind === "digital_product" ? DIGITAL_OFFER_DEFAULT_PRICE : "1.00"}
                                    data-testid="input-offer-price"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("p2p.minLimit")}</Label>
                                <MoneyInput value={minLimit} onChange={(event) => setMinLimit(event.target.value)} placeholder={String(offerEligibility?.minTradeAmount || DIGITAL_OFFER_DEFAULT_MIN_LIMIT)} data-testid="input-offer-min" />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("p2p.maxLimit")}</Label>
                                <MoneyInput value={maxLimit} onChange={(event) => setMaxLimit(event.target.value)} placeholder={String(offerEligibility?.maxTradeAmount || DIGITAL_OFFER_DEFAULT_MAX_LIMIT)} data-testid="input-offer-max" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{t("transactions.processingTime")}</Label>
                            <Select value={paymentTimeLimit} onValueChange={setPaymentTimeLimit}>
                                <SelectTrigger data-testid="select-offer-payment-time-limit">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(offerEligibility?.allowedPaymentTimeLimits || [15, 30, 45, 60]).map((minutes) => (
                                        <SelectItem key={minutes} value={String(minutes)}>
                                            {minutes}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 rounded-lg border p-3" data-testid="input-offer-payment-methods">
                            <div className="flex items-center justify-between gap-2">
                                <Label>{t("p2p.paymentMethods")}</Label>
                                <Badge variant="outline">{paymentMethodIds.length}</Badge>
                            </div>

                            {(offerEligibility?.paymentMethods || []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t("p2p.settings.noPaymentMethods")}</p>
                            ) : (
                                <div className="grid gap-2">
                                    {(offerEligibility?.paymentMethods || []).map((method) => {
                                        const checked = paymentMethodIds.includes(method.id);
                                        return (
                                            <button
                                                key={method.id}
                                                type="button"
                                                className={cn(
                                                    "flex items-center justify-between gap-3 rounded-md border p-2 text-left transition-colors",
                                                    checked ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                                                )}
                                                onClick={() => {
                                                    setPaymentMethodIds((current) =>
                                                        current.includes(method.id)
                                                            ? current.filter((id) => id !== method.id)
                                                            : [...current, method.id],
                                                    );
                                                }}
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">{method.displayLabel?.trim() || method.name}</p>
                                                    <p className="text-xs text-muted-foreground">{method.type}</p>
                                                </div>
                                                {method.isVerified && <Badge variant="outline">{t("common.verified")}</Badge>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>{t("p2p.dispute.descriptionLabel")}</Label>
                            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} placeholder={t("p2p.dispute.additionalDetailsPlaceholder")} data-testid="input-offer-terms" />
                        </div>

                        <div className="space-y-2">
                            <Label>{t("p2p.settings.autoReplyMessage")}</Label>
                            <Textarea value={autoReply} onChange={(e) => setAutoReply(e.target.value)} rows={2} placeholder={t("p2p.settings.autoReplyPlaceholder")} data-testid="input-offer-auto-reply" />
                        </div>

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={closeCreateOffer}>
                                {t("common.cancel")}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => createOfferMutation.mutate()}
                                disabled={
                                    createOfferMutation.isPending
                                    || !currentDealKind
                                    || !offerEligibility?.canCreateOffer
                                    || !canSubmit
                                }
                                data-testid="button-submit-offer"
                            >
                                {createOfferMutation.isPending ? t("common.loading") : t("common.submit")}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
