. (Join-Path $PSScriptRoot '_common.ps1')

Invoke-OooAction {
    param($r)
    Set-MailboxAutoReplyConfiguration -Identity $r.upn -AutoReplyState Disabled | Out-Null
    Get-OooSnapshot -Upn $r.upn
}
