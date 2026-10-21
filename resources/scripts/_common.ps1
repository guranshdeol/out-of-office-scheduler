$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'

$script:ResultMarker = '__OOO_RESULT__'

function Write-Result {
    param([Parameter(Mandatory)] $Result)
    $json = $Result | ConvertTo-Json -Depth 8 -Compress
    [Console]::Out.WriteLine($script:ResultMarker + $json)
}

function Format-OooTime {
    param($Value)
    if ($null -eq $Value) { return $null }
    try {
        $d = [datetime]$Value
        return [ordered]@{ iso = $d.ToString('o'); kind = "$($d.Kind)" }
    } catch {
        return [ordered]@{ iso = "$Value"; kind = 'Raw' }
    }
}

# CreateOOFEvent is left out on purpose: Get-MailboxAutoReplyConfiguration reports it as False
# right after Set-MailboxAutoReplyConfiguration -CreateOOFEvent $true has created the calendar
# block, so it says nothing reliable. Whether a block was asked for comes from the app's setting.
function Get-OooSnapshot {
    param([Parameter(Mandatory)][string] $Upn)
    $c = Get-MailboxAutoReplyConfiguration -Identity $Upn
    return [ordered]@{
        state            = "$($c.AutoReplyState)"
        start            = Format-OooTime $c.StartTime
        end              = Format-OooTime $c.EndTime
        externalAudience = "$($c.ExternalAudience)"
    }
}

function Connect-Mailbox {
    param([Parameter(Mandatory)] $Request)
    Import-Module ExchangeOnlineManagement -ErrorAction Stop | Out-Null
    Connect-ExchangeOnline -AccessToken $Request.token -UserPrincipalName $Request.upn -ShowBanner:$false `
        -CommandName Get-MailboxAutoReplyConfiguration, Set-MailboxAutoReplyConfiguration | Out-Null
}

function ConvertFrom-EpochMs {
    param([Parameter(Mandatory)] [long] $Ms)
    return [DateTimeOffset]::FromUnixTimeMilliseconds($Ms).UtcDateTime
}

function Invoke-OooAction {
    param([Parameter(Mandatory)][scriptblock] $Action)
    $connected = $false
    try {
        $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
        Connect-Mailbox $request
        $connected = $true
        $data = & $Action $request
        Write-Result ([ordered]@{ ok = $true; data = $data })
    } catch {
        Write-Result ([ordered]@{ ok = $false; error = "$($_.Exception.Message)"; type = $_.Exception.GetType().FullName })
    } finally {
        if ($connected) {
            try { Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch { }
        }
    }
}
