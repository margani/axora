<#
.SYNOPSIS
Checks the status of a Cloudflare Pages deployment.

.DESCRIPTION
Uses the Cloudflare API directly to fetch either a specific Pages deployment or
the latest deployment for a project, optionally filtered by branch. With -Poll,
the script keeps checking until the deployment reaches a terminal state or the
timeout is reached.

Cloudflare API endpoints used:
- GET /accounts/{account_id}/pages/projects/{project_name}/deployments
- GET /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}

Where to find values:`
- AccountId: Cloudflare dashboard URL, for example https://dash.cloudflare.com/<ACCOUNT_ID>/pages,
  or the account overview/API area in the dashboard.
- ProjectName: Cloudflare Pages project name, visible in Pages project settings and URLs.
- ApiToken: Create a Cloudflare API token with Cloudflare Pages Read or Edit access.
  The script reads CLOUDFLARE_API_TOKEN if -ApiToken is not supplied.

.EXAMPLE
.\scripts\Get-CloudflarePagesDeploymentStatus.ps1 `
  -AccountId "xxxx" `
  -ProjectName "axora" `
  -BranchName "main" `
  -Poll

.EXAMPLE
$env:CLOUDFLARE_API_TOKEN = "..."
.\scripts\Get-CloudflarePagesDeploymentStatus.ps1 -AccountId "xxxx" -ProjectName "axora" -Poll

.EXAMPLE
.\scripts\Get-CloudflarePagesDeploymentStatus.ps1 `
  -AccountId "xxxx" `
  -ProjectName "axora" `
  -DeploymentId "deployment-id" `
  -AsJson
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$AccountId,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProjectName,

  [string]$BranchName,

  [string]$DeploymentId,

  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,

  [switch]$Poll,

  [ValidateRange(1, 86400)]
  [int]$TimeoutSeconds = 300,

  [ValidateRange(1, 3600)]
  [int]$IntervalSeconds = 10,

  [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:HadApiError = $false
$script:TimedOut = $false

function Write-Color {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [ConsoleColor]$Color = [ConsoleColor]::White
  )

  if ($AsJson) {
    return
  }

  Write-Host $Text -ForegroundColor $Color
}

function Get-EncodedPathSegment {
  param([Parameter(Mandatory = $true)][string]$Value)
  return [System.Uri]::EscapeDataString($Value)
}

function Get-ObjectProperty {
  param(
    $Object,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name) {
    return $Object.$Name
  }

  return $null
}

function Get-CloudflareHeaders {
  if ([string]::IsNullOrWhiteSpace($ApiToken)) {
    throw 'Missing Cloudflare API token. Pass -ApiToken or set CLOUDFLARE_API_TOKEN.'
  }

  return @{
    Authorization = "Bearer $ApiToken"
    Accept        = 'application/json'
  }
}

function Format-CloudflareApiErrors {
  param($Response)

  $parts = @()
  foreach ($item in @(Get-ObjectProperty $Response 'errors')) {
    if ($null -eq $item) {
      continue
    }

    $code = Get-ObjectProperty $item 'code'
    $message = Get-ObjectProperty $item 'message'
    if (-not $message) {
      $message = $item | ConvertTo-Json -Compress
    }
    $parts += ("{0} {1}" -f $code, $message).Trim()
  }

  if ($parts.Count -eq 0) {
    return 'Cloudflare API returned success=false.'
  }

  return ($parts -join '; ')
}

function Invoke-CloudflareRequest {
  param([Parameter(Mandatory = $true)][string]$Uri)

  $headers = Get-CloudflareHeaders

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers -ErrorAction Stop
  } catch {
    $script:HadApiError = $true
    $statusCode = $null
    $body = $null
    $exceptionResponse = Get-ObjectProperty $_.Exception 'Response'
    $errorDetails = Get-ObjectProperty $_ 'ErrorDetails'

    if ($exceptionResponse) {
      try {
        $statusCode = [int]$exceptionResponse.StatusCode
      } catch {
        $statusCode = $null
      }
    }

    $errorDetailsMessage = Get-ObjectProperty $errorDetails 'Message'
    if ($errorDetailsMessage) {
      $body = $errorDetailsMessage
    }

    if ($statusCode) {
      throw "Cloudflare API request failed with HTTP $statusCode. $body"
    }

    throw "Cloudflare API request failed. $($_.Exception.Message)"
  }

  if ($response.PSObject.Properties.Name -contains 'success' -and -not (Get-ObjectProperty $response 'success')) {
    $script:HadApiError = $true
    throw (Format-CloudflareApiErrors -Response $response)
  }

  return $response
}

function Get-BaseDeploymentsUri {
  $account = Get-EncodedPathSegment $AccountId
  $project = Get-EncodedPathSegment $ProjectName
  return "https://api.cloudflare.com/client/v4/accounts/$account/pages/projects/$project/deployments"
}

function Get-DeploymentBranch {
  param($Deployment)

  $trigger = Get-ObjectProperty $Deployment 'deployment_trigger'
  $metadata = Get-ObjectProperty $trigger 'metadata'
  if ($metadata) {
    foreach ($name in @('branch', 'branch_name')) {
      if ($metadata.PSObject.Properties.Name -contains $name -and $metadata.$name) {
        return [string]$metadata.$name
      }
    }
  }

  $branch = Get-ObjectProperty $Deployment 'branch'
  if ($branch) {
    return [string]$branch
  }

  return ''
}

function Get-CommitHash {
  param($Deployment)

  $trigger = Get-ObjectProperty $Deployment 'deployment_trigger'
  $metadata = Get-ObjectProperty $trigger 'metadata'
  if ($metadata) {
    foreach ($name in @('commit_hash', 'commit_sha', 'commit')) {
      if ($metadata.PSObject.Properties.Name -contains $name -and $metadata.$name) {
        return [string]$metadata.$name
      }
    }
  }

  return ''
}

function Get-CommitMessage {
  param($Deployment)

  $trigger = Get-ObjectProperty $Deployment 'deployment_trigger'
  $metadata = Get-ObjectProperty $trigger 'metadata'
  if ($metadata) {
    foreach ($name in @('commit_message', 'message')) {
      if ($metadata.PSObject.Properties.Name -contains $name -and $metadata.$name) {
        return [string]$metadata.$name
      }
    }
  }

  return ''
}

function Get-DeploymentStage {
  param($Deployment)

  $latestStage = Get-ObjectProperty $Deployment 'latest_stage'
  if ($latestStage) {
    return $latestStage
  }

  $stages = Get-ObjectProperty $Deployment 'stages'
  if ($stages -and @($stages).Count -gt 0) {
    return @($stages)[-1]
  }

  return $null
}

function Get-DeploymentStatus {
  param($Deployment)

  $stage = Get-DeploymentStage $Deployment
  if ($null -eq $stage) {
    return 'unknown'
  }

  $stageName = if (Get-ObjectProperty $stage 'name') { [string](Get-ObjectProperty $stage 'name') } else { '' }
  $stageStatus = if (Get-ObjectProperty $stage 'status') { [string](Get-ObjectProperty $stage 'status') } else { '' }

  if ($stageStatus -eq 'success') {
    return 'success'
  }

  if ($stageStatus -in @('failure', 'canceled')) {
    return $stageStatus
  }

  if ($stageStatus -in @('active', 'idle') -and $stageName) {
    return $stageName
  }

  if ($stageName) {
    return "$stageName/$stageStatus".TrimEnd('/')
  }

  if ($stageStatus) {
    return $stageStatus
  }

  return 'unknown'
}

function Test-TerminalStatus {
  param([Parameter(Mandatory = $true)][string]$Status)

  return $Status -in @('success', 'failure', 'canceled', 'cancelled', 'failed')
}

function Test-FailureStatus {
  param([Parameter(Mandatory = $true)][string]$Status)

  return $Status -in @('failure', 'canceled', 'cancelled', 'failed')
}

function Get-StatusColor {
  param([Parameter(Mandatory = $true)][string]$Status)

  if ($Status -eq 'success') {
    return [ConsoleColor]::Green
  }

  if (Test-FailureStatus $Status) {
    return [ConsoleColor]::Red
  }

  if ($Status -in @('queued', 'initialize', 'clone_repo', 'build', 'deploy', 'active', 'idle')) {
    return [ConsoleColor]::Yellow
  }

  return [ConsoleColor]::Gray
}

function Get-DeploymentCompletedTime {
  param($Deployment)

  $stage = Get-DeploymentStage $Deployment
  $endedOn = Get-ObjectProperty $stage 'ended_on'
  if ($stage -and $endedOn) {
    return [string]$endedOn
  }

  foreach ($name in @('modified_on', 'created_on')) {
    $value = Get-ObjectProperty $Deployment $name
    if ($value) {
      return [string]$value
    }
  }

  return ''
}

function ConvertTo-DeploymentSummary {
  param($Deployment)

  $status = Get-DeploymentStatus $Deployment
  $environment = ''
  $deploymentEnvironment = Get-ObjectProperty $Deployment 'environment'
  $productionBranch = Get-ObjectProperty $Deployment 'production_branch'
  if ($deploymentEnvironment) {
    $environment = [string]$deploymentEnvironment
  } elseif ($productionBranch) {
    $environment = [string]$productionBranch
  }

  $aliases = @()
  $deploymentAliases = Get-ObjectProperty $Deployment 'aliases'
  if ($deploymentAliases) {
    $aliases = @($deploymentAliases)
  }

  $url = ''
  $deploymentUrl = Get-ObjectProperty $Deployment 'url'
  if ($deploymentUrl) {
    $url = [string]$deploymentUrl
  } elseif ($aliases.Count -gt 0) {
    $url = [string]$aliases[0]
  }

  $stage = Get-DeploymentStage $Deployment
  $deploymentId = Get-ObjectProperty $Deployment 'id'
  $deploymentProjectName = Get-ObjectProperty $Deployment 'project_name'
  $createdOn = Get-ObjectProperty $Deployment 'created_on'
  $modifiedOn = Get-ObjectProperty $Deployment 'modified_on'
  $isProduction = Get-ObjectProperty $Deployment 'is_production'

  [pscustomobject]@{
    DeploymentId   = [string]$deploymentId
    ProjectName    = if ($deploymentProjectName) { [string]$deploymentProjectName } else { $ProjectName }
    Branch         = Get-DeploymentBranch $Deployment
    CommitHash     = Get-CommitHash $Deployment
    CommitMessage  = Get-CommitMessage $Deployment
    Status         = $status
    Stage          = if ($stage) { [string](Get-ObjectProperty $stage 'name') } else { '' }
    StageStatus    = if ($stage) { [string](Get-ObjectProperty $stage 'status') } else { '' }
    CreatedOn      = if ($createdOn) { [string]$createdOn } else { '' }
    ModifiedOn     = if ($modifiedOn) { [string]$modifiedOn } else { '' }
    CompletedOn    = Get-DeploymentCompletedTime $Deployment
    Url            = $url
    Aliases        = $aliases
    Environment    = $environment
    IsProduction   = if ($null -ne $isProduction) { [bool]$isProduction } else { $environment -eq 'production' }
  }
}

function Write-DeploymentSummary {
  param($Summary)

  if ($AsJson) {
    $Summary | ConvertTo-Json -Depth 8
    return
  }

  Write-Color "Cloudflare Pages deployment" ([ConsoleColor]::White)
  Write-Color ("  Deployment id : {0}" -f $Summary.DeploymentId) ([ConsoleColor]::Gray)
  Write-Color ("  Project       : {0}" -f $Summary.ProjectName) ([ConsoleColor]::Gray)
  Write-Color ("  Branch        : {0}" -f $(if ($Summary.Branch) { $Summary.Branch } else { 'unknown' })) ([ConsoleColor]::Gray)
  Write-Color ("  Commit        : {0}" -f $(if ($Summary.CommitHash) { $Summary.CommitHash } else { 'unknown' })) ([ConsoleColor]::Gray)
  if ($Summary.CommitMessage) {
    Write-Color ("  Message       : {0}" -f $Summary.CommitMessage) ([ConsoleColor]::Gray)
  }
  Write-Color ("  Status        : {0}" -f $Summary.Status) (Get-StatusColor $Summary.Status)
  Write-Color ("  Stage         : {0} ({1})" -f $Summary.Stage, $Summary.StageStatus) ([ConsoleColor]::Gray)
  Write-Color ("  Created       : {0}" -f $Summary.CreatedOn) ([ConsoleColor]::Gray)
  Write-Color ("  Modified      : {0}" -f $(if ($Summary.ModifiedOn) { $Summary.ModifiedOn } else { 'unknown' })) ([ConsoleColor]::Gray)
  Write-Color ("  Completed     : {0}" -f $(if ($Summary.CompletedOn) { $Summary.CompletedOn } else { 'not complete' })) ([ConsoleColor]::Gray)
  Write-Color ("  Environment   : {0}" -f $(if ($Summary.Environment) { $Summary.Environment } else { 'unknown' })) ([ConsoleColor]::Gray)
  Write-Color ("  Production    : {0}" -f $Summary.IsProduction) ([ConsoleColor]::Gray)
  Write-Color ("  URL           : {0}" -f $(if ($Summary.Url) { $Summary.Url } else { 'unknown' })) ([ConsoleColor]::Gray)
  if ($Summary.Aliases.Count -gt 0) {
    Write-Color ("  Aliases       : {0}" -f ($Summary.Aliases -join ', ')) ([ConsoleColor]::Gray)
  }
}

function Get-DeploymentById {
  $deployment = Get-EncodedPathSegment $DeploymentId
  $uri = "{0}/{1}" -f (Get-BaseDeploymentsUri), $deployment
  $response = Invoke-CloudflareRequest -Uri $uri
  return (Get-ObjectProperty $response 'result')
}

function Get-LatestDeployment {
  $baseUri = Get-BaseDeploymentsUri
  $page = 1
  $perPage = 25
  $allDeployments = @()

  do {
    $uri = "$baseUri`?page=$page&per_page=$perPage"
    $response = Invoke-CloudflareRequest -Uri $uri
    $deployments = @(Get-ObjectProperty $response 'result')

    if ($BranchName) {
      $deployments = @($deployments | Where-Object { (Get-DeploymentBranch $_) -eq $BranchName })
    }

    $allDeployments += $deployments

    $resultInfo = Get-ObjectProperty $response 'result_info'
    if ($allDeployments.Count -gt 0 -or -not $resultInfo) {
      break
    }

    $resultTotalPages = Get-ObjectProperty $resultInfo 'total_pages'
    $totalPages = if ($resultTotalPages) { [int]$resultTotalPages } else { 1 }
    $page++
  } while ($page -le $totalPages -and $page -le 10)

  if ($allDeployments.Count -eq 0) {
    if ($BranchName) {
      throw "No deployments found for project '$ProjectName' on branch '$BranchName'."
    }

    throw "No deployments found for project '$ProjectName'."
  }

  return @($allDeployments | Sort-Object -Property @{ Expression = { Get-ObjectProperty $_ 'created_on' }; Descending = $true })[0]
}

function Get-TargetDeployment {
  if ($DeploymentId) {
    return Get-DeploymentById
  }

  return Get-LatestDeployment
}

function Write-PollUpdate {
  param($Summary)

  if ($AsJson) {
    return
  }

  $time = Get-Date -Format 'HH:mm:ss'
  $branchText = if ($Summary.Branch) { $Summary.Branch } else { 'unknown branch' }
  Write-Host ("[{0}] {1} | {2} | {3}" -f $time, $Summary.DeploymentId, $branchText, $Summary.Status) -ForegroundColor (Get-StatusColor $Summary.Status)
}

try {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  do {
    $deployment = Get-TargetDeployment
    $summary = ConvertTo-DeploymentSummary $deployment

    if ($Poll) {
      Write-PollUpdate $summary
    }

    if (-not $Poll -or (Test-TerminalStatus $summary.Status)) {
      break
    }

    if ((Get-Date) -ge $deadline) {
      $script:TimedOut = $true
      break
    }

    Start-Sleep -Seconds $IntervalSeconds
  } while ($true)

  Write-DeploymentSummary $summary

  if ($script:TimedOut) {
    Write-Color "Timed out waiting for Cloudflare Pages deployment to finish after $TimeoutSeconds seconds." ([ConsoleColor]::Red)
    exit 124
  }

  if (Test-FailureStatus $summary.Status) {
    exit 1
  }

  exit 0
} catch {
  if ($AsJson) {
    [pscustomobject]@{
      Error = $_.Exception.Message
    } | ConvertTo-Json -Depth 4
  } else {
    Write-Color $_.Exception.Message ([ConsoleColor]::Red)
  }

  exit 2
}
