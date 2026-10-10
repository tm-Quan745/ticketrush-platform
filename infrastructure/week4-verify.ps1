param([switch]$SkipFullBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force backend/target | Out-Null
    if (-not $SkipFullBuild) {
        & mvn -B -ntp -f backend/pom.xml verify *> backend/target/week4-final-verify.log
        $result = $LASTEXITCODE
        Get-Content backend/target/week4-final-verify.log -Tail 18
        if ($result -ne 0) { throw 'Build or tests failed' }
    }
    foreach ($run in 1..5) {
        & mvn -B -ntp -f backend/pom.xml '-Dtest=OrderPaymentIntegrationTest' '-Dgroups=concurrency' test *> "backend/target/week4-concurrency-$run.log"
        $result = $LASTEXITCODE
        Write-Output "Concurrency run $run"
        Get-Content "backend/target/week4-concurrency-$run.log" -Tail 12
        if ($result -ne 0) { throw "Concurrency run $run failed" }
    }
} finally { Pop-Location }
