. (Join-Path $PSScriptRoot '_common.ps1')

Invoke-OooAction {
    param($r)
    $params = @{
        Identity         = $r.upn
        AutoReplyState   = 'Scheduled'
        StartTime        = ConvertFrom-EpochMs $r.startMs
        EndTime          = ConvertFrom-EpochMs $r.endMs
        InternalMessage  = $r.html
        ExternalMessage  = $r.html
        ExternalAudience = 'All'
    }
    if ($r.createEvent) {
        $params.CreateOOFEvent = $true
        $params.OOFEventSubject = $r.subject
    }
    Set-MailboxAutoReplyConfiguration @params | Out-Null
    Get-OooSnapshot -Upn $r.upn
}
