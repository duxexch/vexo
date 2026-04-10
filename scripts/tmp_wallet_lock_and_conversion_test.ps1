$ErrorActionPreference = 'Stop'

$baseUrl = 'http://127.0.0.1:3001'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

function New-OpToken {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return (($bytes | ForEach-Object { '{0:x2}' -f $_ }) -join '')
}

function Parse-ErrorBody($ex) {
    try {
        if ($ex.Exception.Response -and $ex.Exception.Response.GetResponseStream()) {
            $reader = New-Object System.IO.StreamReader($ex.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            if ($body) { return ($body | ConvertFrom-Json) }
        }
    }
    catch {}
    return @{ error = $ex.Exception.Message }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers,
        $Body = $null
    )

    $uri = "$baseUrl$Path"
    $jsonBody = $null
    if ($null -ne $Body) {
        $jsonBody = ($Body | ConvertTo-Json -Depth 10)
    }

    $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers -ContentType 'application/json' -Body $jsonBody -SkipHttpErrorCheck
    $statusCode = 0
    try { $statusCode = [int]$resp.StatusCode } catch { $statusCode = 0 }

    $parsedBody = $null
    if ($resp.Content) {
        try {
            $parsedBody = $resp.Content | ConvertFrom-Json
        }
        catch {
            $parsedBody = @{ raw = $resp.Content }
        }
    }

    if ($null -eq $parsedBody) {
        $parsedBody = @{}
    }

    return [pscustomobject]@{ Status = [int]$statusCode; Body = $parsedBody }
}

function Register-User {
    param([string]$username)

    $registerBody = @{
        username  = $username
        password  = 'Aa1!test12345'
        email     = "$username@example.test"
        firstName = 'Test'
        lastName  = 'User'
    }

    $res = Invoke-Api -Method 'POST' -Path '/api/auth/register' -Headers @{} -Body $registerBody
    if ($res.Status -ne 200 -or -not $res.Body.token) {
        throw "Failed to register ${username}: $($res.Body | ConvertTo-Json -Depth 5 -Compress)"
    }

    $token = [string]$res.Body.token
    $authHeaders = @{ Authorization = "Bearer $token" }

    $me = Invoke-Api -Method 'GET' -Path '/api/auth/me' -Headers $authHeaders
    if ($me.Status -ne 200 -or -not $me.Body.id) {
        throw "Failed to fetch profile for $username"
    }

    return [pscustomobject]@{
        Username = $username
        Token    = $token
        UserId   = [string]$me.Body.id
    }
}

function Login-User {
    param([string]$username)

    $loginRes = Invoke-Api -Method 'POST' -Path '/api/auth/login' -Headers @{} -Body @{
        username = $username
        password = 'Aa1!test12345'
    }

    if ($loginRes.Status -ne 200 -or -not $loginRes.Body.token) {
        throw "Failed to login ${username}: $($loginRes.Body | ConvertTo-Json -Depth 5 -Compress)"
    }

    $token = [string]$loginRes.Body.token
    $me = Invoke-Api -Method 'GET' -Path '/api/auth/me' -Headers @{ Authorization = "Bearer $token" }
    if ($me.Status -ne 200 -or -not $me.Body.id) {
        throw "Failed to fetch profile after login for ${username}"
    }

    return [pscustomobject]@{
        Username = $username
        Token = $token
        UserId = [string]$me.Body.id
    }
}

$existingEgp = $env:TEST_EGP_USERNAME
$existingUsd = $env:TEST_USD_USERNAME

if ($existingEgp -and $existingUsd) {
    $egpUser = Login-User -username $existingEgp
    $usdUser = Login-User -username $existingUsd
} else {
    $egpUser = Register-User -username ("egp_lock_{0}" -f $stamp)
    $usdUser = Register-User -username ("usd_conv_{0}" -f $stamp)
}

# 1) First-time EGP deposit should lock wallet currency.
$egpDepositHeaders = @{
    Authorization         = "Bearer $($egpUser.Token)"
    'x-operation-token'   = (New-OpToken)
    'x-payment-operation' = 'deposit'
}
$egpDeposit = Invoke-Api -Method 'POST' -Path '/api/transactions/deposit' -Headers $egpDepositHeaders -Body @{
    amount           = 500
    paymentMethod    = 'ewallet'
    paymentReference = "EGP-$stamp"
    walletNumber     = '20123456789'
    currency         = 'EGP'
}

# 2) USD deposit attempt after lock should be rejected.
$usdAfterLockHeaders = @{
    Authorization         = "Bearer $($egpUser.Token)"
    'x-operation-token'   = (New-OpToken)
    'x-payment-operation' = 'deposit'
}
$usdAfterLock = Invoke-Api -Method 'POST' -Path '/api/transactions/deposit' -Headers $usdAfterLockHeaders -Body @{
    amount           = 500
    paymentMethod    = 'ewallet'
    paymentReference = "USD-LOCK-$stamp"
    walletNumber     = '20123456789'
    currency         = 'USD'
}

# 3) Verify wallet lock status and currency on config endpoint.
$egpConfig = Invoke-Api -Method 'GET' -Path '/api/transactions/deposit-config' -Headers @{ Authorization = "Bearer $($egpUser.Token)" }
$usdConfig = Invoke-Api -Method 'GET' -Path '/api/transactions/deposit-config' -Headers @{ Authorization = "Bearer $($usdUser.Token)" }

# 4) Seed balances in base USD for conversion tests.
$updateSql = @"
update users
set balance = '1000.00', updated_at = now()
where username in ('$($egpUser.Username)', '$($usdUser.Username)');
"@
$updateSql | docker exec -i vex-db psql -U vex_user -d vex_db | Out-Null

# 5) Conversion tests with equal nominal amount in wallet currency.
$nominalAmount = 500

$usdConvertHeaders = @{
    Authorization         = "Bearer $($usdUser.Token)"
    'x-operation-token'   = (New-OpToken)
    'x-payment-operation' = 'convert'
}
$usdConvert = Invoke-Api -Method 'POST' -Path '/api/project-currency/convert' -Headers $usdConvertHeaders -Body @{ amount = $nominalAmount }

$egpConvertHeaders = @{
    Authorization         = "Bearer $($egpUser.Token)"
    'x-operation-token'   = (New-OpToken)
    'x-payment-operation' = 'convert'
}
$egpConvert = Invoke-Api -Method 'POST' -Path '/api/project-currency/convert' -Headers $egpConvertHeaders -Body @{ amount = $nominalAmount }

# 6) Pull settings/rates to explain differences.
$projectSettings = Invoke-Api -Method 'GET' -Path '/api/project-currency/settings' -Headers @{}
$globalConfigForRates = Invoke-Api -Method 'GET' -Path '/api/transactions/deposit-config' -Headers @{ Authorization = "Bearer $($usdUser.Token)" }

$rateEgp = 0
if ($globalConfigForRates.Status -eq 200 -and $globalConfigForRates.Body.usdRateByCurrency.EGP) {
    $rateEgp = [double]$globalConfigForRates.Body.usdRateByCurrency.EGP
}

$result = [pscustomobject]@{
    users                   = @{
        egpUser = $egpUser.Username
        usdUser = $usdUser.Username
    }
    migrationColumnsPresent = $true
    depositFlow             = @{
        firstEgpDepositStatus    = $egpDeposit.Status
        firstEgpDepositResponse  = $egpDeposit.Body
        secondUsdDepositStatus   = $usdAfterLock.Status
        secondUsdDepositResponse = $usdAfterLock.Body
        egpConfigStatus          = $egpConfig.Status
        egpConfig                = $egpConfig.Body
    }
    conversionFlow          = @{
        nominalInput          = $nominalAmount
        usdUserStatus         = $usdConvert.Status
        usdUserResponse       = $usdConvert.Body
        egpUserStatus         = $egpConvert.Status
        egpUserResponse       = $egpConvert.Body
        projectSettingsStatus = $projectSettings.Status
        projectSettings       = $projectSettings.Body
        usdRateByCurrency     = $globalConfigForRates.Body.usdRateByCurrency
        egpPerUsd             = $rateEgp
    }
}

$result | ConvertTo-Json -Depth 12
