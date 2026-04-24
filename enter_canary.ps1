param(
    [string]$Reason = 'enter_canary_mode',
    [string]$OperatorId = 'local-script'
)

& "$PSScriptRoot\set_cutover_mode.ps1" -Mode canary -Reason $Reason -OperatorId $OperatorId -EnsureV2Started
