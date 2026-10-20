. (Join-Path $PSScriptRoot '_common.ps1')

Invoke-OooAction {
    param($r)
    $snapshot = Get-OooSnapshot -Upn $r.upn
    $setCmd = Get-Command Set-MailboxAutoReplyConfiguration -ErrorAction SilentlyContinue
    [ordered]@{
        snapshot       = $snapshot
        canSet         = [bool]$setCmd
        canCreateEvent = [bool]($setCmd -and $setCmd.Parameters.ContainsKey('CreateOOFEvent'))
    }
}
