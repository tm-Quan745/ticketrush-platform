# Run only with an idle Maven workspace. Each mutation is restored in finally.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $week4Mutations = @(
        @{
            Name = 'dedup'
            Path = 'backend/src/main/resources/db/migration/V4__orders_payments_idempotency.sql'
            Before = 'provider_event_id VARCHAR(150) NOT NULL UNIQUE'
            After = 'provider_event_id VARCHAR(150) NOT NULL'
            Test = 'OrderPaymentIntegrationTest#twentyDuplicateWebhooks'
        },
        @{
            Name = 'guard'
            Path = 'backend/src/main/java/com/vibe/ticketrush/payment/repository/PaymentRepository.java'
            Before = 'WHERE id=? AND status=?",next.name()'
            After = 'WHERE id=? AND length(?)>=0",next.name()'
            Test = 'OrderPaymentIntegrationTest#failureDuplicatesAndOutOfOrder'
        }
    )
    foreach ($week4Mutation in $week4Mutations) {
        $week4Path = Join-Path $projectRoot $week4Mutation.Path
        $week4Original = [IO.File]::ReadAllText($week4Path)
        if (-not $week4Original.Contains($week4Mutation.Before)) { throw "Mutation target not found: $($week4Mutation.Name)" }
        try {
            [IO.File]::WriteAllText($week4Path, $week4Original.Replace($week4Mutation.Before, $week4Mutation.After))
            & mvn -B -ntp -f backend/pom.xml "-Dtest=$($week4Mutation.Test)" test *> "backend/target/week4-mutation-$($week4Mutation.Name).log"
            $week4Result = $LASTEXITCODE
            Write-Output "Mutation $($week4Mutation.Name): exit $week4Result (expected nonzero)"
            Select-String -Path "backend/target/week4-mutation-$($week4Mutation.Name).log" -Pattern 'Tests run:|expected:|but was:|BUILD FAILURE'
            if ($week4Result -eq 0) { throw "Mutation survived: $($week4Mutation.Name)" }
        } finally {
            [IO.File]::WriteAllText($week4Path, $week4Original)
            Write-Output "Restored $($week4Mutation.Path)"
        }
    }
} finally { Pop-Location }
