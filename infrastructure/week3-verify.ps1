param([switch]$Benchmark)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Force backend/target | Out-Null
    & mvn -B -ntp -f backend/pom.xml verify *> backend/target/week3-final-verify.log
    $result = $LASTEXITCODE
    Get-Content backend/target/week3-final-verify.log -Tail 20
    if ($result -ne 0) { throw 'Build or tests failed' }
    foreach ($run in 1..5) {
        & mvn -B -ntp -f backend/pom.xml '-Dtest=*ReservationIntegrationTest' '-Dgroups=concurrency' test *> "backend/target/week3-concurrency-$run.log"
        $result = $LASTEXITCODE
        Write-Output "Concurrency run $run"
        Get-Content "backend/target/week3-concurrency-$run.log" -Tail 12
        if ($result -ne 0) { throw "Concurrency run $run failed" }
    }
    if ($Benchmark) {
        & mvn -B -ntp -f backend/pom.xml -Pweek3-benchmark test *> backend/target/week3-benchmark.log
        $result = $LASTEXITCODE
        Select-String -Path backend/target/week3-benchmark.log -Pattern 'WEEK3_BENCH'
        Get-Content backend/target/week3-benchmark.log -Tail 16
        if ($result -ne 0) { throw 'Benchmark failed' }
    }
} finally {
    Pop-Location
}
