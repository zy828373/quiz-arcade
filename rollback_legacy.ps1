param(
    [string]$Reason = 'rollback_to_legacy',
    [string]$OperatorId = 'local-script',
    [int]$GraceDelayMs = 0
)

& "$PSScriptRoot\set_cutover_mode.ps1" -Mode legacy -Reason $Reason -OperatorId $OperatorId -StopV2AfterLegacy -GraceDelayMs $GraceDelayMs
