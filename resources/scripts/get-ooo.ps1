. (Join-Path $PSScriptRoot '_common.ps1')

Invoke-OooAction {
    param($r)
    Get-OooSnapshot -Upn $r.upn
}
