param(
    [string]$Reason = 'enter_parallel_mode',
    [string]$OperatorId = 'local-script'
)

& "$PSScriptRoot\set_cutover_mode.ps1" -Mode parallel -Reason $Reason -OperatorId $OperatorId -EnsureV2Started
