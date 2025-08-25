<#
  scripts/test-cloudrun.ps1
  -----------------------------------------------------------
  Usage examples:
    # Run full demo flow end-to-end (topups, webhook, hold, capture)
    pwsh ./scripts/test-cloudrun.ps1 -RunDemo

    # Or call individual steps:
    pwsh ./scripts/test-cloudrun.ps1 -TestHealth
    pwsh ./scripts/test-cloudrun.ps1 -TopupUser pharmacy_A 2000
    pwsh ./scripts/test-cloudrun.ps1 -SimulateMoMoWebhook -PaymentId <ID> -Amount 2000
    pwsh ./scripts/test-cloudrun.ps1 -CreateHold -ExchangeId ex_test -A pharmacy_A -B pharmacy_B -CourierFee 1000
    pwsh ./scripts/test-cloudrun.ps1 -CaptureExchange -ExchangeId ex_test -Courier courier_001
    pwsh ./scripts/test-cloudrun.ps1 -GetWallet pharmacy_A
#>

[CmdletBinding()]
param(
  # Project / region
  [string]$ProjectId = "nowastemed",
  [string]$Region    = "europe-west1",

  # Cloud Run URLs (override if you redeploy)
  [string]$HealthUrl         = "https://health-b5eslgu2iq-ew.a.run.app",
  [string]$TopupUrl          = "https://topupintent-b5eslgu2iq-ew.a.run.app",
  [string]$MomoWebhookUrl    = "https://momowebhook-b5eslgu2iq-ew.a.run.app",
  [string]$OrangeWebhookUrl  = "https://orangewebhook-b5eslgu2iq-ew.a.run.app",
  [string]$HoldUrl           = "https://createexchangehold-b5eslgu2iq-ew.a.run.app",
  [string]$CaptureUrl        = "https://exchangecapture-b5eslgu2iq-ew.a.run.app",
  [string]$CancelUrl         = "https://exchangecancel-b5eslgu2iq-ew.a.run.app",

  # Quick switches
  [switch]$RunDemo,
  [switch]$TestHealth,

  # Ad-hoc actions (optional)
  [switch]$ListWebhookLogs,
  [string]$GetWallet,
  [string]$TopupUser,
  [int]   $Amount,
  [string]$PaymentId,
  [switch]$SimulateMoMoWebhook,
  [switch]$SimulateOrangeWebhook,
  [switch]$CreateHold,
  [string]$ExchangeId,
  [string]$A,
  [string]$B,
  [int]   $CourierFee,
  [switch]$CaptureExchange,
  [string]$Courier,
  [switch]$CancelExchange
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- Helpers ----------
function Get-AccessToken {
  (& gcloud auth print-access-token).Trim()
}

function Get-Secret([string]$Name) {
  $t = & gcloud secrets versions access latest --secret=$Name --project=$ProjectId 2>$null
  if (-not $?) { throw "Failed to read secret '$Name'." }
  $t.Trim()
}

function Get-FirestoreBase {
  "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents"
}

function Invoke-JsonPost {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)]$BodyObject
  )
  $json = $BodyObject | ConvertTo-Json -Depth 10
  Invoke-WebRequest -Method POST -ContentType 'application/json' -Body $json -Uri $Uri
}

function Get-FirestoreNumber($field) {
  if ($null -eq $field) { return $null }
  if ($field.integerValue) { return [int]$field.integerValue }
  if ($field.doubleValue)  { return [double]$field.doubleValue }
  return $null
}

function FS-Get {
  param([string]$Path) # Path like "wallets/pharmacy_A"
  $AT   = Get-AccessToken
  $H    = @{ Authorization = "Bearer $AT" }
  $BASE = Get-FirestoreBase
  Invoke-WebRequest -Headers $H -Method GET "$BASE/$Path"
}

function Read-WebhookLog {
  param([string]$Provider, [string]$Txn)
  $AT   = Get-AccessToken
  $H    = @{ Authorization = "Bearer $AT" }
  $BASE = Get-FirestoreBase
  $docId = [Uri]::EscapeDataString("$Provider`:$Txn")
  Invoke-WebRequest -Headers $H -Method GET "$BASE/webhook_logs/$docId"
}

function Show-Wallet {
  param([string]$UserId)
  try {
    $r = FS-Get "wallets/$UserId"
    $doc = $r.Content | ConvertFrom-Json
    $f = $doc.fields
    $available = Get-FirestoreNumber $f.available
    $held      = Get-FirestoreNumber $f.held
    $currency  = $f.currency.stringValue
    Write-Host ("{0}: available={1} held={2} {3}" -f $UserId,$available,$held,$currency) -ForegroundColor Cyan
  } catch {
    Write-Warning "wallet $UserId: not found or unauthorized"
  }
}

function New-UniqueTxn([string]$prefix="sim") {
  "$prefix-" + ([guid]::NewGuid().ToString("N").Substring(0,8))
}

# ---------- Atomic steps ----------
function Step-Health {
  Write-Host "→ Health check..." -ForegroundColor Yellow
  (Invoke-WebRequest $HealthUrl).Content
}

function Step-TopupIntent {
  param([string]$UserId, [int]$Amount, [string]$Method="mtn_momo", [string]$Currency="XAF", [string]$Msisdn=$null)
  $body = @{ userId=$UserId; method=$Method; amount=$Amount; currency=$Currency; msisdn=$Msisdn }
  $r = Invoke-JsonPost -Uri $TopupUrl -BodyObject $body
  $pid = (ConvertFrom-Json $r.Content).paymentId
  Write-Host "  paymentId: $pid" -ForegroundColor Green
  return $pid
}

function Step-SimulateMoMoWebhook {
  param([string]$PaymentId, [int]$Amount, [string]$Currency="XAF", [string]$TxnId=(New-UniqueTxn "momo"))
  $token = Get-Secret "MOMO_CALLBACK_TOKEN"
  $body  = @{ paymentId=$PaymentId; financialTransactionId=$TxnId; amount=$Amount; currency=$Currency }
  $r = Invoke-JsonPost -Uri "$MomoWebhookUrl?token=$token" -BodyObject $body
  Write-Host "  momo webhook -> $($r.StatusCode) (txn:$TxnId)" -ForegroundColor Green
  return $TxnId
}

function Step-SimulateOrangeWebhook {
  param([string]$PaymentId, [int]$Amount, [string]$Currency="XAF", [string]$TxnId=(New-UniqueTxn "orange"))
  $token = Get-Secret "ORANGE_CALLBACK_TOKEN"
  $body  = @{ paymentId=$PaymentId; transactionId=$TxnId; amount=$Amount; currency=$Currency }
  $r = Invoke-JsonPost -Uri "$OrangeWebhookUrl?token=$token" -BodyObject $body
  Write-Host "  orange webhook -> $($r.StatusCode) (txn:$TxnId)" -ForegroundColor Green
  return $TxnId
}

function Step-VerifyPayment {
  param([string]$PaymentId)
  Write-Host "→ Verify payment $PaymentId" -ForegroundColor Yellow
  (FS-Get "payments/$PaymentId").Content
}

function Step-CreateHold {
  param([string]$ExchangeId, [string]$A, [string]$B, [int]$CourierFee, [string]$Currency="XAF")
  if (-not $ExchangeId) { $ExchangeId = "ex_" + [Guid]::NewGuid().ToString("N") }
  $body = @{ exchangeId=$ExchangeId; aId=$A; bId=$B; courierFee=$CourierFee; currency=$Currency }
  $r = Invoke-JsonPost -Uri $HoldUrl -BodyObject $body
  Write-Host "  HOLD response: $($r.Content)" -ForegroundColor Green
  return $ExchangeId
}

function Step-CaptureExchange {
  param([string]$ExchangeId, [string]$CourierId)
  $body = @{ exchangeId=$ExchangeId; courierId=$CourierId }
  $r = Invoke-JsonPost -Uri $CaptureUrl -BodyObject $body
  Write-Host "  CAPTURE response: $($r.Content)" -ForegroundColor Green
}

function Step-CancelExchange {
  param([string]$ExchangeId)
  $body = @{ exchangeId=$ExchangeId }
  $r = Invoke-JsonPost -Uri $CancelUrl -BodyObject $body
  Write-Host "  CANCEL response: $($r.Content)" -ForegroundColor Green
}

function Step-ReadWebhookLog {
  param([string]$Provider="mtn_momo", [string]$TxnId)
  (Read-WebhookLog -Provider $Provider -Txn $TxnId).Content
}

# ---------- Demo flow ----------
function Run-Demo {
  Write-Host "`n======== DEMO FLOW ========" -ForegroundColor Magenta

  # 0) Health
  Step-Health | Out-Host

  # 1) Top-up A (+2000) and B (+2000)
  Write-Host "`n→ Top-up pharmacy_A (+2000)" -ForegroundColor Yellow
  $payA = Step-TopupIntent -UserId "pharmacy_A" -Amount 2000
  $txnA = Step-SimulateMoMoWebhook -PaymentId $payA -Amount 2000
  Write-Host "  Checking wallet A:" -ForegroundColor Yellow
  Show-Wallet "pharmacy_A"

  Write-Host "`n→ Top-up pharmacy_B (+2000)" -ForegroundColor Yellow
  $payB = Step-TopupIntent -UserId "pharmacy_B" -Amount 2000
  $txnB = Step-SimulateMoMoWebhook -PaymentId $payB -Amount 2000
  Write-Host "  Checking wallet B:" -ForegroundColor Yellow
  Show-Wallet "pharmacy_B"

  # 2) Create 50/50 hold (1000 => 500/500)
  Write-Host "`n→ Create 50/50 hold (1000 XAF)" -ForegroundColor Yellow
  $EX = "ex_" + [Guid]::NewGuid().ToString("N")
  $EX = Step-CreateHold -ExchangeId $EX -A "pharmacy_A" -B "pharmacy_B" -CourierFee 1000
  Write-Host "  ExchangeId: $EX" -ForegroundColor Cyan

  # 3) Capture (pay courier, release holds)
  Write-Host "`n→ Capture (courier_001)" -ForegroundColor Yellow
  Step-CaptureExchange -ExchangeId $EX -CourierId "courier_001"

  # 4) Final states
  Write-Host "`n→ Final states" -ForegroundColor Yellow
  Show-Wallet "courier_001"
  Show-Wallet "pharmacy_A"
  Show-Wallet "pharmacy_B"

  Write-Host "`n(You can inspect the exchange doc in Firestore: exchanges/$EX)" -ForegroundColor DarkGray
}

# ---------- Entry points ----------
if ($TestHealth) { Step-Health | Out-Host; return }

if ($RunDemo) { Run-Demo; return }

if ($TopupUser -and $Amount) {
  $pid = Step-TopupIntent -UserId $TopupUser -Amount $Amount
  Write-Host "paymentId: $pid"
  return
}

if ($SimulateMoMoWebhook) {
  if (-not $PaymentId -or -not $Amount) { throw "Provide -PaymentId and -Amount." }
  $txn = Step-SimulateMoMoWebhook -PaymentId $PaymentId -Amount $Amount
  Write-Host "txnId: $txn"
  return
}

if ($SimulateOrangeWebhook) {
  if (-not $PaymentId -or -not $Amount) { throw "Provide -PaymentId and -Amount." }
  $txn = Step-SimulateOrangeWebhook -PaymentId $PaymentId -Amount $Amount
  Write-Host "txnId: $txn"
  return
}

if ($CreateHold) {
  if (-not $A -or -not $B -or -not $CourierFee) { throw "Provide -A, -B, -CourierFee. Optionally -ExchangeId." }
  $eid = Step-CreateHold -ExchangeId $ExchangeId -A $A -B $B -CourierFee $CourierFee
  Write-Host "exchangeId: $eid"
  return
}

if ($CaptureExchange) {
  if (-not $ExchangeId -or -not $Courier) { throw "Provide -ExchangeId and -Courier." }
  Step-CaptureExchange -ExchangeId $ExchangeId -CourierId $Courier
  return
}

if ($CancelExchange) {
  if (-not $ExchangeId) { throw "Provide -ExchangeId." }
  Step-CancelExchange -ExchangeId $ExchangeId
  return
}

if ($GetWallet) {
  Show-Wallet $GetWallet
  return
}

if ($ListWebhookLogs) {
  $AT = Get-AccessToken
  $H  = @{ Authorization = "Bearer $AT" }
  $BASE = Get-FirestoreBase
  $RUNQ = "$BASE`:runQuery"
  $body = @{
    structuredQuery = @{
      from    = @(@{ collectionId = "webhook_logs" })
      orderBy = @(@{ field=@{ fieldPath="receivedAt"}; direction="DESCENDING" })
      limit   = 10
    }
  } | ConvertTo-Json -Depth 10
  (Invoke-WebRequest -Headers $H -Method POST -ContentType 'application/json' -Body $body -Uri $RUNQ).Content | Out-Host
  return
}

Write-Host "No action selected. Try -RunDemo or -TestHealth or see header for examples." -ForegroundColor DarkYellow
