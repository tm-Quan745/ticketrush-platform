$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$java = Join-Path $root 'backend/src/main/java/com/vibe/ticketrush/inventory/service/RedisInventoryGate.java'
$lua = Join-Path $root 'backend/src/main/resources/redis/inventory-gate.lua'
$repository = Join-Path $root 'backend/src/main/java/com/vibe/ticketrush/inventory/repository/TicketTierRepository.java'
$snapshots = @{}
foreach ($path in @($java,$lua,$repository)) { $snapshots[$path] = [IO.File]::ReadAllBytes($path) }
$encoding = [Text.UTF8Encoding]::new($false)
function Restore-Sources { foreach ($path in $snapshots.Keys) { [IO.File]::WriteAllBytes($path,$snapshots[$path]) } }
function Mutate($path,$from,$to) {
    $text = [IO.File]::ReadAllText($path)
    if (!$text.Contains($from)) { throw "Mutation target not found in $path" }
    [IO.File]::WriteAllText($path,$text.Replace($from,$to),$encoding)
}
function Test-Mutant($name,$test) {
    & mvn -B -ntp -f backend/pom.xml "-Dtest=Week6RedisIntegrationTest#$test" test *> "week6-mutation-$name.log"
    $result=$LASTEXITCODE
    $summary=Select-String -Path "week6-mutation-$name.log" -Pattern 'Tests run:.*Failures: [1-9]'
    if ($result -eq 0 -or !$summary) { throw "Mutation $name was not killed by an assertion; inspect the log" }
    Write-Output "MUTATION ${name}: KILLED (assertion failed, exit=$result)"
    $summary | ForEach-Object { Write-Output $_.Line }
}
try {
    # GET+SET inside one Lua call is still atomic. Split them into client commands instead.
    Mutate $lua "redis.call('DECRBY', KEYS[1], qty)" 'local ignored = qty'
    $from = '() -> redis.execute(gate, keys(tier,id), Integer.toString(quantity),id.toString(),TTL,Long.toString(properties.attemptLease().toMillis()))'
    $to = @'
() -> {
            String old=redis.opsForValue().get(counter(tier));
            String value=redis.execute(gate,keys(tier,id),Integer.toString(quantity),id.toString(),TTL,Long.toString(properties.attemptLease().toMillis()));
            if ("OK".equals(value) && old!=null) {
                java.util.concurrent.locks.LockSupport.parkNanos(1_000_000);
                redis.opsForValue().set(counter(tier),Long.toString(Long.parseLong(old)-quantity),java.time.Duration.ofDays(1));
            }
            return value;
        }
'@
    Mutate $java $from $to
    Test-Mutant 'get-set' 'fiveHundredThreadsForOneHundredTickets'
    Restore-Sources
    Mutate $repository 'WHERE id=:id AND available_quantity>=:quantity' 'WHERE id=:id'
    Test-Mutant 'db-guard' 'wrongRedisValueStillUsesDatabaseGuard'
    Restore-Sources
    Mutate $java 'attempt.id().toString(),committed ? "1":"0",TTL' 'attempt.id().toString(),"1",TTL'
    Test-Mutant 'compensation' 'rollbackAndDuplicateCompensation'
} finally { Restore-Sources }
