param(
  [Parameter(Mandatory=$true)]
  [string]$OldId,

  [Parameter(Mandatory=$true)]
  [string]$CanonicalId,

  [string]$Database = "actmaster_db",

  [switch]$Local,

  [switch]$Json
)

$ErrorActionPreference = "Stop"

function SqlText([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

function Invoke-D1Query([string]$Sql) {
  $Sql = (($Sql -replace "\s+", " ").Trim())
  if (-not $Sql.EndsWith(";")) { $Sql += ";" }
  $args = @("wrangler", "d1", "execute", $Database)
  if (-not $Local) { $args += "--remote" }
  $args += @("--json", "--command", $Sql)
  $raw = & npx.cmd @args
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler d1 execute failed: $($raw | Out-String)"
  }
  $payload = ($raw | Out-String).Trim() | ConvertFrom-Json
  if ($payload -is [array]) { return @($payload[0].results) }
  return @($payload.results)
}

function Invoke-D1QuerySafe([string]$Sql) {
  try {
    return @(Invoke-D1Query $Sql)
  } catch {
    return @()
  }
}

function FirstText($Values) {
  foreach ($value in $Values) {
    $text = [string]$value
    if ($text.Trim()) { return $text.Trim() }
  }
  return ""
}

function BestRole($A, $B) {
  $roles = @([string]$A, [string]$B)
  if ($roles -contains "admin") { return "admin" }
  if ($roles -contains "store") { return "store" }
  return FirstText $roles
}

$old = SqlText $OldId
$canonical = SqlText $CanonicalId

$oldUsers = Invoke-D1QuerySafe @"
SELECT row_id,line_id,name,phone,role,store_id,referrer_id,network_id,legacy_line_id,point_line_id,identity_source,migrated_at
FROM users
WHERE line_id = $old OR row_id = $old OR legacy_line_id = $old OR point_line_id = $old
LIMIT 20
"@

$canonicalUsers = Invoke-D1QuerySafe @"
SELECT row_id,line_id,name,phone,role,store_id,referrer_id,network_id,legacy_line_id,point_line_id,identity_source,migrated_at
FROM users
WHERE line_id = $canonical OR row_id = $canonical OR legacy_line_id = $canonical OR point_line_id = $canonical
LIMIT 20
"@

$oldCards = Invoke-D1QuerySafe @"
SELECT row_id,line_id,profile_user_id,owner_user_id,creator_id,name,company_name,title,mobile,source_type,visibility,pool_eligible,crm_status,network_id,created_at,updated_at
FROM card_contacts
WHERE line_id = $old OR profile_user_id = $old OR owner_user_id = $old OR creator_id = $old
ORDER BY updated_at DESC, created_at DESC
LIMIT 50
"@

$canonicalCards = Invoke-D1QuerySafe @"
SELECT row_id,line_id,profile_user_id,owner_user_id,creator_id,name,company_name,title,mobile,source_type,visibility,pool_eligible,crm_status,network_id,created_at,updated_at
FROM card_contacts
WHERE line_id = $canonical OR profile_user_id = $canonical OR owner_user_id = $canonical OR creator_id = $canonical
ORDER BY updated_at DESC, created_at DESC
LIMIT 50
"@

$linkRows = Invoke-D1QuerySafe @"
SELECT old_line_id,new_line_id,match_method,confidence,status,note,updated_at
FROM user_identity_links
WHERE old_line_id IN ($old,$canonical) OR new_line_id IN ($old,$canonical)
LIMIT 50
"@

$impact = [ordered]@{}
$impact.cardsLineId = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM card_contacts WHERE line_id = $old")[0].count
$impact.cardsProfileUserId = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM card_contacts WHERE profile_user_id = $old")[0].count
$impact.cardsOwnerUserId = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM card_contacts WHERE owner_user_id = $old")[0].count
$impact.cardsCreatorId = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM card_contacts WHERE creator_id = $old")[0].count
$impact.userReferrers = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM users WHERE referrer_id = $old")[0].count
$impact.pointAwards = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM point_awards WHERE user_id = $old")[0].count
$impact.inboxReceiver = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM inbox_items WHERE receiver_user_id = $old")[0].count
$impact.inboxSender = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM inbox_items WHERE sender_user_id = $old")[0].count
$impact.personalTasks = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM personal_tasks WHERE user_id = $old")[0].count
$impact.registrants = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM registrants WHERE line_id = $old")[0].count
$impact.ordersBuyer = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM orders WHERE buyer_id = $old")[0].count
$impact.ordersSponsor = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM orders WHERE sponsor_id = $old")[0].count
$impact.ordersRecruiter = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM orders WHERE recruiter_id = $old")[0].count
$impact.ordersPlacement = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM orders WHERE placement_parent_id = $old")[0].count
$impact.bonusBeneficiary = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM bonus_transactions WHERE beneficiary_id = $old")[0].count
$impact.bonusSource = @(Invoke-D1QuerySafe "SELECT COUNT(*) AS count FROM bonus_transactions WHERE source_user_id = $old")[0].count

$oldUser = @($oldUsers)[0]
$canonicalUser = @($canonicalUsers)[0]
$oldSelfCard = @($oldCards | Where-Object { [string]$_.source_type -eq "self_profile" })[0]
$canonicalSelfCard = @($canonicalCards | Where-Object { [string]$_.source_type -eq "self_profile" })[0]
$oldRecentCard = @($oldCards)[0]
$canonicalRecentCard = @($canonicalCards)[0]

$recommendedUser = [ordered]@{
  line_id = $CanonicalId
  legacy_line_id = $OldId
  point_line_id = FirstText @($canonicalUser.point_line_id, $CanonicalId)
  name = FirstText @($canonicalUser.name, $oldUser.name, $canonicalSelfCard.name, $oldSelfCard.name, $canonicalRecentCard.name, $oldRecentCard.name)
  phone = FirstText @($canonicalUser.phone, $oldUser.phone, $canonicalSelfCard.mobile, $oldSelfCard.mobile, $canonicalRecentCard.mobile, $oldRecentCard.mobile)
  role = BestRole $canonicalUser.role $oldUser.role
  referrer_id = FirstText @($canonicalUser.referrer_id, $oldUser.referrer_id)
  network_id = FirstText @($canonicalUser.network_id, $oldUser.network_id, $canonicalRecentCard.network_id, $oldRecentCard.network_id, "admin")
  identity_source = "manual_confirm"
}

$steps = @(
  "Create or update users row for CanonicalId with legacy_line_id=OldId and point_line_id=CanonicalId or existing point_line_id.",
  "Create or update active user_identity_links row OldId -> CanonicalId.",
  "Move old card identity references where safe: line_id, profile_user_id, owner_user_id, creator_id.",
  "Move inbound/outbound inbox identity references if the business rule confirms one account.",
  "Move personal_tasks.user_id if follow-up reminders belong to the same person.",
  "Move point_awards.user_id only for local traceability; external point ledger is not changed by this dry-run.",
  "Do not delete any card. Deletion requires a separate manual decision."
)

$warnings = New-Object System.Collections.Generic.List[string]
if (-not @($oldUsers).Count -and -not @($oldCards).Count) {
  $warnings.Add("OldId has no matching user/card rows. Confirm the ID is correct.")
}
if (-not @($canonicalUsers).Count -and -not @($canonicalCards).Count) {
  $warnings.Add("CanonicalId has no matching user/card rows. Confirm this is really the target account.")
}
if (@($oldUsers).Count -gt 1) {
  $warnings.Add("OldId matches multiple user rows. Repair must be manual-reviewed.")
}
if (@($canonicalUsers).Count -gt 1) {
  $warnings.Add("CanonicalId matches multiple user rows. Repair must be manual-reviewed.")
}
if ($recommendedUser.referrer_id -eq $CanonicalId -or $recommendedUser.referrer_id -eq $OldId) {
  $warnings.Add("Recommended referrer points to old/canonical identity. Check for self-referral before writing.")
}
if (@($oldCards | Where-Object { [string]$_.source_type -ne "self_profile" -and [string]$_.line_id -eq $OldId }).Count) {
  $warnings.Add("OldId is bound to non-self CRM cards. Confirm these cards are not scanned assets before moving line_id.")
}
if (@($canonicalSelfCard).Count -and @($oldSelfCard).Count) {
  $warnings.Add("Both identities have self_profile cards. Choose one primary personal card before write repair.")
}

$report = [ordered]@{
  mode = "dry-run"
  writes = 0
  remote = -not $Local
  database = $Database
  oldId = $OldId
  canonicalId = $CanonicalId
  recommendedUser = $recommendedUser
  impact = $impact
  oldUsers = @($oldUsers)
  canonicalUsers = @($canonicalUsers)
  oldCards = @($oldCards)
  canonicalCards = @($canonicalCards)
  identityLinks = @($linkRows)
  proposedSteps = $steps
  warnings = @($warnings)
}

if ($Json) {
  $report | ConvertTo-Json -Depth 7
  exit 0
}

Write-Host "Identity repair preview: $OldId -> $CanonicalId"
Write-Host "Database: $Database $(if ($Local) { 'local' } else { 'remote' })"
Write-Host "Writes: 0"
Write-Host ""
Write-Host "Recommended canonical user"
$recommendedUser.GetEnumerator() | Format-Table -AutoSize
Write-Host "Impact counts"
$impact.GetEnumerator() | Format-Table -AutoSize
Write-Host "Old users"
@($oldUsers) | Format-Table -AutoSize
Write-Host "Canonical users"
@($canonicalUsers) | Format-Table -AutoSize
Write-Host "Old cards"
@($oldCards) | Format-Table -AutoSize
Write-Host "Canonical cards"
@($canonicalCards) | Format-Table -AutoSize
Write-Host "Proposed dry-run steps"
foreach ($step in $steps) { Write-Host "- $step" }
if (@($warnings).Count) {
  Write-Host "Warnings"
  foreach ($warning in $warnings) { Write-Host "- $warning" }
}
