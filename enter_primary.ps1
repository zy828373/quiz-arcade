param(
    [string]$Reason = 'enter_primary_mode',
    [string]$OperatorId = 'local-script'
)

& "$PSScriptRoot\set_cutover_mode.ps1" -Mode primary -Reason $Reason -OperatorId $OperatorId -EnsureV2Started
