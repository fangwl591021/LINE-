param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$Identity,

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

$id = SqlText $Identity

$users = Invoke-D1Query @"
SELECT row_id,line_id,name,phone,role,store_id,referrer_id,network_id,
       legacy_line_id,point_line_id,identity_source,migrated_at
FROM users
WHERE line_id = $id
   OR row_id = $id
   OR legacy_line_id = $id
   OR point_line_id = $id
   OR referrer_id = $id
LIMIT 50
"@

$aliases = New-Object System.Collections.Generic.HashSet[string]
[void]$aliases.Add($Identity)
foreach ($user in $users) {
  foreach ($field in @("row_id", "line_id", "legacy_line_id", "point_line_id")) {
    $value = [string]$user.$field
    if ($value.Trim()) { [void]$aliases.Add($value.Trim()) }
  }
}
$idList = (($aliases | ForEach-Object { SqlText $_ }) -join ",")
if (-not $idList) { $idList = "''" }

$cards = Invoke-D1Query @"
SELECT row_id,line_id,profile_user_id,owner_user_id,creator_id,name,company_name,title,mobile,
       source_type,visibility,pool_eligible,crm_status,network_id,created_at,updated_at
FROM card_contacts
WHERE line_id IN ($idList)
   OR profile_user_id IN ($idList)
   OR owner_user_id IN ($idList)
   OR creator_id IN ($idList)
ORDER BY updated_at DESC, created_at DESC
LIMIT 50
"@

$pointAwards = @()
try {
  $pointAwards = Invoke-D1Query @"
SELECT award_id,user_id,card_id,award_type,points,point_type,status,created_at,updated_at
FROM point_awards
WHERE user_id IN ($idList)
ORDER BY created_at DESC
LIMIT 30
"@
} catch {}

$inbox = @()
try {
  $inbox = Invoke-D1Query @"
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN read_at = '' OR read_at IS NULL THEN 1 ELSE 0 END) AS unread,
  SUM(CASE WHEN receiver_user_id IN ($idList) THEN 1 ELSE 0 END) AS received,
  SUM(CASE WHEN sender_user_id IN ($idList) THEN 1 ELSE 0 END) AS sent
FROM inbox_items
WHERE receiver_user_id IN ($idList)
   OR sender_user_id IN ($idList)
"@
} catch {}

$tasks = @()
try {
  $tasks = Invoke-D1Query @"
SELECT task_id,user_id,title,task_type,due_at,status,created_at,updated_at
FROM personal_tasks
WHERE user_id IN ($idList)
ORDER BY due_at ASC, created_at DESC
LIMIT 30
"@
} catch {}

$warnings = New-Object System.Collections.Generic.List[string]
if (@($users).Count -gt 1) {
  $warnings.Add("Multiple user rows match this identity. Check account merge mapping.")
}
foreach ($user in $users) {
  if ([string]$user.point_line_id -and [string]$user.line_id -and [string]$user.point_line_id -ne [string]$user.line_id) {
    $warnings.Add("point_line_id differs from line_id. Point writes should use point_line_id.")
    break
  }
}
foreach ($card in $cards) {
  if ([string]$card.source_type -ne "self_profile" -and $aliases.Contains([string]$card.line_id)) {
    $warnings.Add("A non-self card is bound to this identity. Check scanned CRM card vs personal card ownership.")
    break
  }
}

$report = [ordered]@{
  identity = $Identity
  remote = -not $Local
  database = $Database
  aliases = @($aliases)
  users = @($users)
  cards = @($cards)
  pointAwards = @($pointAwards)
  inboxSummary = @($inbox)
  tasks = @($tasks)
  warnings = @($warnings)
}

if ($Json) {
  $report | ConvertTo-Json -Depth 6
  exit 0
}

Write-Host "Identity diagnostic: $Identity"
Write-Host "Database: $Database $(if ($Local) { 'local' } else { 'remote' })"
Write-Host "Aliases: $(@($aliases) -join ', ')"
Write-Host ""
Write-Host "Users"
@($users) | Format-Table -AutoSize
Write-Host "Cards"
@($cards) | Format-Table -AutoSize
Write-Host "Point awards"
@($pointAwards) | Format-Table -AutoSize
Write-Host "Inbox"
@($inbox) | Format-Table -AutoSize
Write-Host "Tasks"
@($tasks) | Format-Table -AutoSize
if (@($warnings).Count) {
  Write-Host "Warnings"
  foreach ($warning in $warnings) { Write-Host "- $warning" }
}
