$ErrorActionPreference = 'Stop'
$baseUrl = 'http://localhost:3001'

function Invoke-JsonApi {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $invokeArgs = @{
        Method             = $Method
        Uri                = "$baseUrl$Path"
        Headers            = $Headers
        SkipHttpErrorCheck = $true
    }

    if ($null -ne $Body) {
        $invokeArgs.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
        $invokeArgs.ContentType = 'application/json'
    }

    $response = Invoke-WebRequest @invokeArgs
    $parsed = $null
    if ($response.Content) {
        try { $parsed = $response.Content | ConvertFrom-Json } catch { $parsed = $response.Content }
    }

    return [ordered]@{
        Status = [int]$response.StatusCode
        Body   = $parsed
        Raw    = $response.Content
    }
}

function Assert-Status {
    param($Result, [int]$Expected, [string]$Step)
    if ([int]$Result.Status -ne $Expected) {
        throw "$Step failed (status=$($Result.Status)): $($Result.Raw)"
    }
}

function Auth-Header([string]$Token) {
    return @{ Authorization = "Bearer $Token" }
}

function New-OperationToken {
    return (([Guid]::NewGuid().ToString('N')) + ([Guid]::NewGuid().ToString('N'))).Substring(0, 32)
}

function With-OperationToken([hashtable]$Headers) {
    $merged = @{}
    foreach ($key in $Headers.Keys) {
        $merged[$key] = $Headers[$key]
    }
    $merged['x-operation-token'] = New-OperationToken
    return $merged
}

function Ensure-LocalP2PApproval {
    param([string]$UserId)

    if ([string]::IsNullOrWhiteSpace($UserId)) {
        throw 'Ensure-LocalP2PApproval requires a non-empty user id'
    }

    $dbContainer = if ($env:VEX_DB_CONTAINER) { $env:VEX_DB_CONTAINER } else { 'vex-db-local' }
    $sql = "INSERT INTO p2p_trader_profiles (user_id, can_create_offers, can_trade_p2p, updated_at) VALUES ('$UserId', TRUE, TRUE, NOW()) ON CONFLICT (user_id) DO UPDATE SET can_create_offers = TRUE, can_trade_p2p = TRUE, updated_at = NOW();"
    $escapedSql = $sql.Replace('"', '\"')

    docker exec -i $dbContainer psql -U vex_user -d vex_db -c "$escapedSql" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to grant local P2P approval for user $UserId using container '$dbContainer'"
    }

    $balanceSql = "UPDATE users SET balance = '100.00', p2p_banned = FALSE, updated_at = NOW() WHERE id = '$UserId';"
    $escapedBalanceSql = $balanceSql.Replace('"', '\"')

    docker exec -i $dbContainer psql -U vex_user -d vex_db -c "$escapedBalanceSql" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to seed local balance for user $UserId using container '$dbContainer'"
    }
}

function Get-Or-CreateUserToken {
    param(
        [string]$Username,
        [string]$Password
    )

    $registerResult = Invoke-JsonApi -Method 'POST' -Path '/api/auth/register' -Body @{ username = $Username; password = $Password }
    if ($registerResult.Status -eq 200 -and $registerResult.Body -and $registerResult.Body.token) {
        return [string]$registerResult.Body.token
    }

    $loginResult = Invoke-JsonApi -Method 'POST' -Path '/api/auth/login' -Body @{ username = $Username; password = $Password }
    Assert-Status -Result $loginResult -Expected 200 -Step "Login existing user '$Username'"
    return [string]$loginResult.Body.token
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$userA = 'p2psmokea_smoke'
$userB = 'p2psmokeb_smoke'
$password = 'Aa1!test12345'
$tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2MsAAAAASUVORK5CYII='

$tokenA = Get-Or-CreateUserToken -Username $userA -Password $password
$tokenB = Get-Or-CreateUserToken -Username $userB -Password $password

$authA = Auth-Header $tokenA
$authB = Auth-Header $tokenB

$meA = Invoke-JsonApi -Method 'GET' -Path '/api/auth/me' -Headers $authA
Assert-Status -Result $meA -Expected 200 -Step 'Fetch profile A'
$meB = Invoke-JsonApi -Method 'GET' -Path '/api/auth/me' -Headers $authB
Assert-Status -Result $meB -Expected 200 -Step 'Fetch profile B'

Ensure-LocalP2PApproval -UserId ([string]$meA.Body.id)
Ensure-LocalP2PApproval -UserId ([string]$meB.Body.id)

$catalog = Invoke-JsonApi -Method 'GET' -Path '/api/payment-methods' -Headers $authA
Assert-Status -Result $catalog -Expected 200 -Step 'Fetch payment methods catalog'
$catalogMethods = @($catalog.Body)
if ($catalogMethods.Count -eq 0) {
    throw 'No active payment methods available in catalog for smoke test'
}
$catalogMethodId = [string]$catalogMethods[0].id

$pmA = Invoke-JsonApi -Method 'POST' -Path '/api/p2p/payment-methods' -Headers $authA -Body @{
    countryPaymentMethodId = $catalogMethodId
    accountNumber          = "ACC-A-$ts"
    holderName             = 'Smoke User A'
    displayLabel           = 'Smoke A Method'
}
Assert-Status -Result $pmA -Expected 201 -Step 'Create P2P payment method A'

$pmB = Invoke-JsonApi -Method 'POST' -Path '/api/p2p/payment-methods' -Headers $authB -Body @{
    countryPaymentMethodId = $catalogMethodId
    accountNumber          = "ACC-B-$ts"
    holderName             = 'Smoke User B'
    displayLabel           = 'Smoke B Method'
}
Assert-Status -Result $pmB -Expected 201 -Step 'Create P2P payment method B'

$pmAId = [string]$pmA.Body.id
$pmBId = [string]$pmB.Body.id
$pmAName = [string]$pmA.Body.name
$pmBName = [string]$pmB.Body.name

$eligA = Invoke-JsonApi -Method 'GET' -Path '/api/p2p/offer-eligibility' -Headers $authA
Assert-Status -Result $eligA -Expected 200 -Step 'Offer eligibility A'
$eligB = Invoke-JsonApi -Method 'GET' -Path '/api/p2p/offer-eligibility' -Headers $authB
Assert-Status -Result $eligB -Expected 200 -Step 'Offer eligibility B'

if (-not $eligA.Body.canCreateOffer) {
    throw "User A cannot create offer: $($eligA.Body.reasons -join ' | ')"
}
if (-not $eligB.Body.canCreateOffer) {
    throw "User B cannot create offer: $($eligB.Body.reasons -join ' | ')"
}

$balanceA = [double]($meA.Body.balance)
$balanceB = [double]($meB.Body.balance)
$currencyA = if ($meA.Body.balanceCurrency) { [string]$meA.Body.balanceCurrency } else { 'USD' }
$currencyB = if ($meB.Body.balanceCurrency) { [string]$meB.Body.balanceCurrency } else { 'USD' }

$sellerKey = if ($balanceA -ge $balanceB) { 'A' } else { 'B' }
$buyerKey = if ($sellerKey -eq 'A') { 'B' } else { 'A' }

if ($sellerKey -eq 'A') {
    $sellerAuth = $authA; $buyerAuth = $authB
    $sellerCurrency = $currencyA; $sellerBalance = $balanceA
    $sellerPmId = $pmAId; $sellerPmName = $pmAName
    $buyerPmId = $pmBId; $buyerPmName = $pmBName
    $requesterUser = $userB
    $approverUser = $userA
}
else {
    $sellerAuth = $authB; $buyerAuth = $authA
    $sellerCurrency = $currencyB; $sellerBalance = $balanceB
    $sellerPmId = $pmBId; $sellerPmName = $pmBName
    $buyerPmId = $pmAId; $buyerPmName = $pmAName
    $requesterUser = $userA
    $approverUser = $userB
}

$offerCreate = $null
$tradeCreatorAuth = $null
$tradeCounterpartyAuth = $null
$tradePaymentMethod = ''
$offerMode = ''

$offerAmountSell = [math]::Round([math]::Max([math]::Min($sellerBalance, 3), 1), 2)
$offerCreateSell = Invoke-JsonApi -Method 'POST' -Path '/api/p2p/offers' -Headers $sellerAuth -Body @{
    type             = 'sell'
    amount           = "$offerAmountSell"
    price            = '1'
    currency         = $sellerCurrency
    fiatCurrency     = $sellerCurrency
    minLimit         = '1'
    maxLimit         = "$offerAmountSell"
    paymentMethodIds = @($sellerPmId)
    paymentTimeLimit = 15
    terms            = 'Smoke test sell offer terms'
    autoReply        = 'Smoke test auto reply'
}

if ($offerCreateSell.Status -eq 201) {
    $offerCreate = $offerCreateSell
    $tradeCreatorAuth = $buyerAuth
    $tradeCounterpartyAuth = $sellerAuth
    $tradePaymentMethod = $sellerPmName
    $offerMode = 'sell_offer'
}
else {
    $offerAmountBuy = '2'
    $offerCreateBuy = Invoke-JsonApi -Method 'POST' -Path '/api/p2p/offers' -Headers $buyerAuth -Body @{
        type             = 'buy'
        amount           = $offerAmountBuy
        price            = '1'
        currency         = $sellerCurrency
        fiatCurrency     = $sellerCurrency
        minLimit         = '1'
        maxLimit         = $offerAmountBuy
        paymentMethodIds = @($buyerPmId)
        paymentTimeLimit = 15
        terms            = 'Smoke test buy offer terms'
        autoReply        = 'Smoke test auto reply'
    }

    if ($offerCreateBuy.Status -ne 201) {
        throw "Failed creating both sell and buy offers. sell=$($offerCreateSell.Raw) | buy=$($offerCreateBuy.Raw)"
    }

    $offerCreate = $offerCreateBuy
    $tradeCreatorAuth = $sellerAuth
    $tradeCounterpartyAuth = $buyerAuth
    $tradePaymentMethod = $buyerPmName
    $offerMode = 'buy_offer'
}

$offerId = [string]$offerCreate.Body.id
$tradeCreate = Invoke-JsonApi -Method 'POST' -Path '/api/p2p/trades' -Headers (With-OperationToken $tradeCreatorAuth) -Body @{
    offerId       = $offerId
    amount        = '1'
    paymentMethod = $tradePaymentMethod
    currencyType  = 'usd'
}
Assert-Status -Result $tradeCreate -Expected 201 -Step 'Create trade'
$tradeId = [string]$tradeCreate.Body.id

$requesterUnreadBefore = (Invoke-JsonApi -Method 'GET' -Path '/api/notifications/unread-count' -Headers $tradeCreatorAuth).Body.count
$approverUnreadBefore = (Invoke-JsonApi -Method 'GET' -Path '/api/notifications/unread-count' -Headers $tradeCounterpartyAuth).Body.count

$cancelRequest = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/cancel/request" -Headers $tradeCreatorAuth -Body @{
    reason                         = 'smoke mutual cancel request'
    confirmNoFundsMoved            = $true
    acceptCancellationConsequences = $true
}
Assert-Status -Result $cancelRequest -Expected 201 -Step 'Cancel request'
$requestId = [string]$cancelRequest.Body.requestId

$cancelApprove = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/cancel/approve" -Headers $tradeCounterpartyAuth -Body @{
    requestId                      = $requestId
    confirmNoFundsMoved            = $true
    acceptCancellationConsequences = $true
}
Assert-Status -Result $cancelApprove -Expected 201 -Step 'Cancel approval'

$cancelFinalize = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/cancel" -Headers $tradeCreatorAuth -Body @{
    reason                         = 'smoke final cancel'
    confirmNoFundsMoved            = $true
    acceptCancellationConsequences = $true
}
Assert-Status -Result $cancelFinalize -Expected 200 -Step 'Cancel finalize'
if ([string]$cancelFinalize.Body.status -ne 'cancelled') {
    throw "Trade did not become cancelled: $($cancelFinalize.Raw)"
}

$msgCreatorText = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCreatorAuth -Body @{ message = 'post-cancel text from requester' }
Assert-Status -Result $msgCreatorText -Expected 201 -Step 'Requester text message after cancel'

$msgCounterpartyText = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCounterpartyAuth -Body @{ message = 'post-cancel text from counterparty' }
Assert-Status -Result $msgCounterpartyText -Expected 201 -Step 'Counterparty text message after cancel'

$uploadCreator = Invoke-JsonApi -Method 'POST' -Path '/api/upload' -Headers $tradeCreatorAuth -Body @{ fileData = $tinyPngDataUrl; fileName = 'smoke-cancel-requester.png' }
Assert-Status -Result $uploadCreator -Expected 201 -Step 'Requester image upload'
$msgCreatorImage = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCreatorAuth -Body @{
    message        = 'post-cancel image from requester'
    attachmentUrl  = [string]$uploadCreator.Body.url
    attachmentType = 'image/png'
}
Assert-Status -Result $msgCreatorImage -Expected 201 -Step 'Requester image message after cancel'

$uploadCounterparty = Invoke-JsonApi -Method 'POST' -Path '/api/upload' -Headers $tradeCounterpartyAuth -Body @{ fileData = $tinyPngDataUrl; fileName = 'smoke-cancel-counterparty.png' }
Assert-Status -Result $uploadCounterparty -Expected 201 -Step 'Counterparty image upload'
$msgCounterpartyImage = Invoke-JsonApi -Method 'POST' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCounterpartyAuth -Body @{
    message        = 'post-cancel image from counterparty'
    attachmentUrl  = [string]$uploadCounterparty.Body.url
    attachmentType = 'image/png'
}
Assert-Status -Result $msgCounterpartyImage -Expected 201 -Step 'Counterparty image message after cancel'

$messagesRequester = Invoke-JsonApi -Method 'GET' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCreatorAuth
Assert-Status -Result $messagesRequester -Expected 200 -Step 'Get trade messages requester'
$messagesCounterparty = Invoke-JsonApi -Method 'GET' -Path "/api/p2p/trades/$tradeId/messages" -Headers $tradeCounterpartyAuth
Assert-Status -Result $messagesCounterparty -Expected 200 -Step 'Get trade messages counterparty'

$msgListRequester = @($messagesRequester.Body)
$msgListCounterparty = @($messagesCounterparty.Body)
$hasRequesterText = @($msgListRequester | Where-Object { [string]$_.message -eq 'post-cancel text from requester' }).Count -gt 0
$hasCounterpartyText = @($msgListRequester | Where-Object { [string]$_.message -eq 'post-cancel text from counterparty' }).Count -gt 0
$hasTwoImages = @($msgListRequester | Where-Object { $_.attachmentUrl }).Count -ge 2

$requesterUnreadAfter = (Invoke-JsonApi -Method 'GET' -Path '/api/notifications/unread-count' -Headers $tradeCreatorAuth).Body.count
$approverUnreadAfter = (Invoke-JsonApi -Method 'GET' -Path '/api/notifications/unread-count' -Headers $tradeCounterpartyAuth).Body.count

$notifsRequester = Invoke-JsonApi -Method 'GET' -Path '/api/notifications?limit=100' -Headers $tradeCreatorAuth
Assert-Status -Result $notifsRequester -Expected 200 -Step 'Requester notifications list'
$notifsCounterparty = Invoke-JsonApi -Method 'GET' -Path '/api/notifications?limit=100' -Headers $tradeCounterpartyAuth
Assert-Status -Result $notifsCounterparty -Expected 200 -Step 'Counterparty notifications list'

$notifRequesterForTrade = @($notifsRequester.Body | Where-Object { [string]$_.type -eq 'p2p' -and [string]$_.metadata -like "*$tradeId*" }).Count
$notifCounterpartyForTrade = @($notifsCounterparty.Body | Where-Object { [string]$_.type -eq 'p2p' -and [string]$_.metadata -like "*$tradeId*" }).Count

if (-not $hasRequesterText -or -not $hasCounterpartyText -or -not $hasTwoImages) {
    throw "Message verification failed after cancel. requesterText=$hasRequesterText counterpartyText=$hasCounterpartyText hasTwoImages=$hasTwoImages"
}

if ($notifRequesterForTrade -lt 1 -or $notifCounterpartyForTrade -lt 1) {
    throw "Notification verification failed for trade messages. requesterTradeNotifs=$notifRequesterForTrade counterpartyTradeNotifs=$notifCounterpartyForTrade"
}

[ordered]@{
    smoke               = 'passed'
    offerMode           = $offerMode
    tradeId             = $tradeId
    users               = @{
        requester = $requesterUser
        approver  = $approverUser
    }
    postCancelMessaging = @{
        requesterMessageAccepted    = $true
        counterpartyMessageAccepted = $true
        imageMessagesAccepted       = $true
        requesterMessageCount       = $msgListRequester.Count
        counterpartyMessageCount    = $msgListCounterparty.Count
    }
    notifications       = @{
        requesterUnreadBefore       = [int]$requesterUnreadBefore
        requesterUnreadAfter        = [int]$requesterUnreadAfter
        approverUnreadBefore        = [int]$approverUnreadBefore
        approverUnreadAfter         = [int]$approverUnreadAfter
        requesterTradeNotifications = [int]$notifRequesterForTrade
        approverTradeNotifications  = [int]$notifCounterpartyForTrade
    }
} | ConvertTo-Json -Depth 8
