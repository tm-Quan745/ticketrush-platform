# Pre-push history rewrite and security gate

## Backup and scope

Date: 2026-10-23. Authorized history rewrite; no push and no remote added.
Independent mirror backup (no hardlinks):
`D:/My pro/ticketrush-platform-pre-rewrite-20261023.git`.
`git rev-parse --is-bare-repository` returned true; `git fsck --full
--no-dangling` exited 0. The backup contains the original sensitive history and
must stay private. It is not a publishable copy. It does not back up ignored
working files or database volumes.

All existing branch/tag refs were rewritten in the project using git-filter-repo
2.47.0. Two clean linked worktrees were reset to their mapped equivalents. The
old origin tracking tips were all ancestors of their matching local branches;
filter-repo removed the pre-existing origin remote as its normal safety behavior.
There are now no project remotes. The backup's local origin is merely the source
of the requested mirror clone; no network remote was added to the project.
Current work is on `codex/pre-push-security-gate`; no additional merge into main.

Command (after verified backup):

```powershell
python .tmp/security-tools/git_filter_repo.py --force --invert-paths --path loadtest/.data/ --path-glob '*.jfr' --prune-empty never --prune-degenerate never --no-gc
```

Then retarget linked worktrees, recreate perf-v1, expire reflogs and run
`git gc --prune=now`. The retained map is
[history-rewrite-commit-map.txt](history-rewrite-commit-map.txt), copied from
`.git/filter-repo/commit-map`. Empty/degenerate commits were not pruned, preserving
all 137 original commits and every ordered parent edge, including 12 merges.
[Graph evidence](history-rewrite-graph.txt) preserves the visible branch structure.

Removed from every rewritten ref:
- All `loadtest/.data/` runtime fixtures, including users, admin, admissions,
  dataset and temporary queue configurations.
- All four historical JFR paths: baseline-C-1, final-C-1, iteration1-C-1 and stress-1.
- The previous scan identified no additional secret-bearing paths outside that
  directory. The post-rewrite scan covers all refs, not only the current branch.

Curated k6 summaries, verifier results, telemetry and reports remain. Backend and
frontend source trees are byte-identical to the pre-rewrite source commit. Only
documentation commit references were relabelled to rewritten equivalents; numbers,
image SHA256 values and measured results did not change. This is not a rerun of
historical performance measurements. Original provenance labels are recoverable
from the mirror and the table below.

## Credential exposure and rotation

The historical fixture audit found 5,001 distinct HS256 JWTs, with USER and
ADMIN roles; all signatures verify using the base64-decoded JWT_SECRET from
`.tools/week7.env`. Issuer is ticketrush; audience is ticketrush-api. The signing
key itself was not present in those fixture files; a token does not reveal a
high-entropy HMAC key. Latest token expiry was 2026-10-19T10:52:49Z, before this
review. Admin JSON contains an ADMIN/USER bearer JWT; users JSON also contains a
shared plaintext password used for the seeded admin account. That password
matches `.tools/week7.env` LOADTEST_PASSWORD. Admission fixtures contain temporary
opaque random admission tokens, validated against Redis for a user/event; these
are not JWT signing secrets.

Compared without printing values against `.env`, `.env.frontend.local`,
`.tools/week7.env`, `.tmp/m2-measure/private.env` and
`.tmp/m2b-measure/private.env`: only the Week 7 config matches. No matching password
was found under another key in those files. This does not establish non-reuse on
other machines, deployments, accounts or services.

Required operator actions before reuse/push review:
1. Rotate JWT_SECRET in the isolated loadtest environment and anywhere that copied
   its value. This invalidates signed tokens after restart.
2. Rotate LOADTEST_PASSWORD and update/reseed the actual buyer/admin password
   hashes. Editing an env file alone does not change existing database passwords.
   Revoke refresh sessions or reset the isolated seeded database as appropriate.
3. If either value was reused elsewhere, rotate the corresponding credential there
   too. Reset the isolated waiting-room namespace to revoke admission grants if
   that historical dataset is reused.

No values are printed or committed here. No credentials or database data were
rotated by this task. POSTGRES_PASSWORD, REDIS_PASSWORD, RABBITMQ_PASSWORD,
PAYMENT_WEBHOOK_SECRET, MOCK_PAYMENT_TEST_TOKEN, METRICS_PASSWORD and
GRAFANA_PASSWORD were not identified in the fixture scan; no exposure of those
keys is asserted.

## Reference update review

`scripts/security/update_commit_references.py` previews replacements by default;
`--write` applies only unambiguous 7–40 character commit references and the annotated
tag object mapping. It handles documentation bytes directly, preserving legacy
encoding and CRLF. SHA256 image IDs are not modified. README, docs, ADRs and result
JSON metadata were checked. The next preview returns zero replacements. Historical
reports describe their original run; their commit labels now point to equivalent
rewritten code, including their old Git-log illustrations. Map/report old columns
are deliberately excluded from substitution.

Reviewed 71 reference occurrences across 21 files.

`perf-v1` is annotated. Its target is unchanged:
`b19db2b7f1033729f75e3fc7e10f9708e2e0204a` (historical performance work and report).
Its tag object was recreated: `c6c93e8245b528a48fa065e6fdb06fbab35efa33` ->
`b1260e2ffe9b7e6ba8dcf1b786517109d6b63aca`.

## Scanner and preventive controls

Same scanner/method as M2b: gitleaks 8.24.3 Docker image pinned to digest
`e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055`;
`git rev-list --objects --all`, export every unique blob with original relative
path under its object ID, then directory scan with default rules, full redaction,
`--ignore-gitleaks-allow`, no custom allowlist and no size limit. The corpus includes
binary blobs. Built-in detector allowlists still apply. This verifies reachable
blob content, not ignored files, the separate backup, commit-message metadata or
external deployment credentials; zero detector findings is not proof of every
possible secret's absence.

Initial post-rewrite full scan: 137 commits, 2,433 unique blobs, 58,943,959 exported
bytes, exit 0, **zero findings**. Final verification evidence is in
[history-rewrite-verification.json](history-rewrite-verification.json).

`python scripts/security/scan.py` performs the full scan. `--staged` exports entire
changed index blobs (not working files or only diff lines). A synthetic generated
JWT was rejected with exit 1, then removed from the index. A real clean commit
passed the installed hook with zero findings. Docker/scanner errors fail closed.
Private scan exports and redacted detailed reports stay under ignored `.tmp/`.

Install the tracked hook in a fresh checkout:

```sh
git config core.hooksPath .githooks
```

Python 3 and Docker are required. This local hook is installed in this checkout.
`.github/workflows/security.yml` fetches full history and runs the same scanner;
only summaries are uploaded. No GitHub execution is claimed because nothing has
been pushed. `.gitignore` covers loadtest/.data/, all *.jfr, .env variants except
.env.example, .tmp/, .tools/, test artifacts and mutable performance runtime paths.

## Verification and size

See the machine-readable verification file for exact test counts and attempts.
The first complete Maven run executed 188 tests with one setup error: PostgreSQL
deadlock in SeatedInventoryIntegrationTest.expiryAndCancellationReleaseExactlyOnce
while TRUNCATE users,events,ticket_tiers CASCADE overlapped background activity.
No application/test code or assertion was changed; the unchanged full suite was
**rerun: 188 tests passed, zero failures/errors/skips, BUILD SUCCESS in 04:08**.
The first run took 04:44. The earlier local Compose stack was stopped to free Docker memory; volumes
were retained. npm tests: 49/49, lint and production build passed after rewrite.
Benchmark-tagged tests are excluded by the existing default Maven profile and are
not represented as executed by this command.

Before:

```text
count: 4892
size: 65.28 MiB
in-pack: 113
packs: 1
size-pack: 197.74 KiB
prune-packable: 0
garbage: 6
size-garbage: 2.00 MiB
```

After rewrite and garbage collection (before new report commits):

```text
count: 0
size: 0 bytes
in-pack: 3885
packs: 1
size-pack: 4.46 MiB
prune-packable: 0
garbage: 0
size-garbage: 0 bytes
```

Final count-objects output is retained in the verification JSON. The six temporary
object files reported as garbage before rewrite were removed by garbage collection.
No push, remote creation, credential rotation or deployment occurred.

## Complete old -> new commit table

Unchanged hashes are intentional: those commits do not contain the removed paths
or affected ancestors. The annotated tag-object mapping is listed separately above.

| Old commit | Rewritten commit |
| --- | --- |
| `00c9654e5029b983bf9f348bbe5bd82f490fb5ca` | `00c9654e5029b983bf9f348bbe5bd82f490fb5ca` |
| `02ddc5cf2c7d8f27e13408a786a8916cb2912de4` | `02ddc5cf2c7d8f27e13408a786a8916cb2912de4` |
| `0365f36efe72980ddb03f096cb022cccbc389325` | `0365f36efe72980ddb03f096cb022cccbc389325` |
| `03f3c31f27c38fca15e8fc8d4d3c250b7e0fe9f7` | `03f3c31f27c38fca15e8fc8d4d3c250b7e0fe9f7` |
| `043594e7a179b25d941643827ff26548db28524d` | `043594e7a179b25d941643827ff26548db28524d` |
| `04dd32c18a8b81cc41194e89aa2df9648569d439` | `04dd32c18a8b81cc41194e89aa2df9648569d439` |
| `08ec95cd357d8d46364b4e62f779ab0805a0e84f` | `08ec95cd357d8d46364b4e62f779ab0805a0e84f` |
| `097ca5d70911806d706a6036c0fa6de79e5ddddb` | `097ca5d70911806d706a6036c0fa6de79e5ddddb` |
| `0b15c5fac7de169b3522afad3221bce5f81864a9` | `f2e73d3ba14944f25d7858f78eb4d3acbda63119` |
| `0b2c0972ea227bd623d759096c7f825f3a974ac8` | `0b2c0972ea227bd623d759096c7f825f3a974ac8` |
| `0d19539275808a9559d9891b66e929b7166408f3` | `0d19539275808a9559d9891b66e929b7166408f3` |
| `117037c8483b544fe6a879cfac382a57a6cd6f50` | `117037c8483b544fe6a879cfac382a57a6cd6f50` |
| `12881c9aa8f17a52b2772934eb7cdaac05da5b35` | `12881c9aa8f17a52b2772934eb7cdaac05da5b35` |
| `135a44977d0c8e0dd00679c8c4ba14d24bda1e8d` | `cd6e678f7786228e2c5c7886a6c00a3603ec5ef3` |
| `13c36d97312c410306578edca618a7da3b1bac57` | `13c36d97312c410306578edca618a7da3b1bac57` |
| `148bd04a5f898c4d11a24544e1205476ef17bcc5` | `148bd04a5f898c4d11a24544e1205476ef17bcc5` |
| `174aac39338fccf6ffdac7b921e26512568d8d26` | `174aac39338fccf6ffdac7b921e26512568d8d26` |
| `1975dd71e634873b444ef71b383eec02d3d66c77` | `fe3528a2d628f5fe5fb14314bc6abf4489a3719b` |
| `1b6427ee139e415fd7b1b6285f52b29053232403` | `1b6427ee139e415fd7b1b6285f52b29053232403` |
| `1c5b127b7fff45844b0f8465c1fc5b033e33cc4d` | `d1c907978259415bc518c4fb57fd4903efd03c82` |
| `1cd01b280d5e8ed332e68de19b45b76f6c4331b9` | `0c91634ad5bd0ca5d1eb054519692bb3a477ff39` |
| `2020f74c09dd82c02104bf44226f5850f94939c3` | `2020f74c09dd82c02104bf44226f5850f94939c3` |
| `2046caac39c56456a597c324ac7d3969f62245d4` | `6a5264ab7e6dd39e864a179efbc7fd2f40f79eb6` |
| `221c66ce71e27b309e10764259ccc8dc59837c8b` | `221c66ce71e27b309e10764259ccc8dc59837c8b` |
| `23cc38f3f6bed20a74bb4653e761a8918d677c42` | `23cc38f3f6bed20a74bb4653e761a8918d677c42` |
| `256be50ccb459c5bb5e3c4776bbccee8bc07a8ac` | `256be50ccb459c5bb5e3c4776bbccee8bc07a8ac` |
| `2b64cc6f4d08d01e23ac374f0fd7f49a7c8d1e9c` | `2b64cc6f4d08d01e23ac374f0fd7f49a7c8d1e9c` |
| `2c8d7b589ff6e82f3ff408496a92fc00bfe3a12c` | `2c8d7b589ff6e82f3ff408496a92fc00bfe3a12c` |
| `3090fcdc83f6720d128c181d4e0b4f422704989a` | `3090fcdc83f6720d128c181d4e0b4f422704989a` |
| `30e4f348f6f842280035f593cce304e8ce12dc45` | `59e8491a245ccec10f4e0e995c32408d7e93dd39` |
| `317c766ddc61a366b564a509efe8590be3071558` | `317c766ddc61a366b564a509efe8590be3071558` |
| `31e3d7e18d33dcdd0d0a264d7f1d4413dde961cb` | `31e3d7e18d33dcdd0d0a264d7f1d4413dde961cb` |
| `32700f8c5cd22baba268d53af81fff9f621936e2` | `32700f8c5cd22baba268d53af81fff9f621936e2` |
| `361f645ca95d26566d7cf656901a28883aa1d1b6` | `361f645ca95d26566d7cf656901a28883aa1d1b6` |
| `3702ddaffffaea7ba39d553a31d56f4a6a9ab2b2` | `3702ddaffffaea7ba39d553a31d56f4a6a9ab2b2` |
| `381d26dcd6768dbeeec9df4dc35540974f10e184` | `381d26dcd6768dbeeec9df4dc35540974f10e184` |
| `3aef4eef562b841ca9d593a4f81fcdc3040c1375` | `95e34e2ba6fa1095edc364a0cdd39c685cfa7a21` |
| `3b885cf5b7c2d00a9952f1a264f80983f01cb4ca` | `d7f3d6deab38e05bc556b390d6b1306e08b47c55` |
| `3f7d66b25ddcb05e2091fbf27f5a98bb223d5073` | `3f7d66b25ddcb05e2091fbf27f5a98bb223d5073` |
| `3f9a2de8c1e835f4aa4429088ceaeee205001f20` | `3f9a2de8c1e835f4aa4429088ceaeee205001f20` |
| `452ceb693691a69db92901896f50179b2e091e5d` | `452ceb693691a69db92901896f50179b2e091e5d` |
| `46e2ee6b60c116a0804c14aa6f15d91891a9f735` | `21a5574da79dd013dc422e62cb418e0db87260cf` |
| `494a33dd5f3df6e17bffa7f55341a43956270903` | `494a33dd5f3df6e17bffa7f55341a43956270903` |
| `4efcaa8f64010291015e224e1e89a16f85e3c0c0` | `cfe1d6e3f5fcb624243c2f447184fd9d85759fc2` |
| `537407f768860e73c61e99b37b2c1e452dcb5e12` | `537407f768860e73c61e99b37b2c1e452dcb5e12` |
| `561976d7049161a8d247be8644addc249a9c0f36` | `742f0f43956cc4ba7a960c3472b847e1c9d0205c` |
| `567d7ffa62657fdfd30f5703a98463959ebc87a0` | `c6ae0012e3cd608b5f38e9729c7e9db288951b84` |
| `577f9e00d2acfa74bfecbc3786edc8842a015b02` | `92dc76baf43be6dc19f389aa7cbdfc49142f736c` |
| `59db2663e12249477fd1490b70843904b8fa1a45` | `59db2663e12249477fd1490b70843904b8fa1a45` |
| `5a398828e0d0fe29facf487c2e1052dcde2c1328` | `5a398828e0d0fe29facf487c2e1052dcde2c1328` |
| `5bda52c4a71ebfc0f6e1752876224d003ec5bfbe` | `5bda52c4a71ebfc0f6e1752876224d003ec5bfbe` |
| `5d6117b4ca8a7f148539cf93bc903f32f7fa6938` | `5d6117b4ca8a7f148539cf93bc903f32f7fa6938` |
| `63f8f497a0978d33c5e002b105b830bd576a1eb6` | `63f8f497a0978d33c5e002b105b830bd576a1eb6` |
| `644fa8e7dda0a6ff261477f82f563bff35bfb52a` | `644fa8e7dda0a6ff261477f82f563bff35bfb52a` |
| `649b06be967fa932c09313c6661cbed506ce7753` | `6692489137c2c0a99c0ccc171629bd5877ef3e27` |
| `652e9a49f082a56649a51c8eae3e154a30337d59` | `b3676a948c62fc5fb117905246f22068581a51ef` |
| `6638fbd45918f99abfa697b05a51685e18b7b6b0` | `6638fbd45918f99abfa697b05a51685e18b7b6b0` |
| `6d532dc8d32230ccf80bfe1cfde4d6f87d1d6c71` | `a3e888244c5976a38acc42d90f0c64f0b7b188ac` |
| `6d7eb5b32f266b57b38897537af113711694d339` | `6d7eb5b32f266b57b38897537af113711694d339` |
| `7150e176915ea001d49ad0f7b72fa83e9bc021f9` | `7150e176915ea001d49ad0f7b72fa83e9bc021f9` |
| `7187daa7c0b8119da584eb11042478c28660d4b7` | `e02be3e8420829b42957b44396261081cd3a1e5c` |
| `71c33da5c3b1fabd0604e2e9a167b0e5d5975039` | `71c33da5c3b1fabd0604e2e9a167b0e5d5975039` |
| `73afe73ba3fe754f1c8455f7178efcadbd208b32` | `59e99a39a8fea49d8600b2450059ec460182420c` |
| `73e828b57a4feac29bc59926e455f06a98a2efc0` | `73e828b57a4feac29bc59926e455f06a98a2efc0` |
| `7886b2927492ad69d5572a0f083ef677fb09abf1` | `015a365b9a1029dfb07827c925bc233af7050297` |
| `79cdccba1c36af9f87d9f949a11cc01801224677` | `67000fd48c28a9eba35bb3ff977e978605c3e4df` |
| `7a242d002d08f1e93fea4b521a77ee259cf1b44b` | `7a242d002d08f1e93fea4b521a77ee259cf1b44b` |
| `7da904516f62fc6e277d65f8aaa6cb2ecd6b000c` | `7da904516f62fc6e277d65f8aaa6cb2ecd6b000c` |
| `7eef8a63833f267144429a3ac8806a9f49a8420a` | `7eef8a63833f267144429a3ac8806a9f49a8420a` |
| `7f288c5440acc2db3e4b6f9cae6b758bb0a77d05` | `64b4d048596ec2c8fa8ef5c14443b87d14ed90a8` |
| `7fd2818b7da4eca7159a0a6abc7393c432d31db2` | `7fd2818b7da4eca7159a0a6abc7393c432d31db2` |
| `831b927181b8a2c269cae90505800d52f0a8e775` | `6225687189b53af627d6d66f1000a4b2a03573ae` |
| `852f4bb78ed53b9d27e22719c2927f8957f75b2b` | `6344877f620336e0d078d7e921c8fc057c3c32d7` |
| `89e7686437ccc2ab84a07fb24891571d6a58234e` | `89e7686437ccc2ab84a07fb24891571d6a58234e` |
| `8b5719f7025342bfeea7114da17903168bcfd6bd` | `8b5719f7025342bfeea7114da17903168bcfd6bd` |
| `8bb0b56fbd4cbd179a9dc8677f59a1905b14c404` | `8bb0b56fbd4cbd179a9dc8677f59a1905b14c404` |
| `8dcd2fb12dc94e8f89506f0d34204a956d21a51e` | `8dcd2fb12dc94e8f89506f0d34204a956d21a51e` |
| `8e565b60f406cb5e18b52f8ab30709a26c00bc87` | `8e565b60f406cb5e18b52f8ab30709a26c00bc87` |
| `901614b5c3a7e498b36a9f225bbb2d4b1fce3255` | `901614b5c3a7e498b36a9f225bbb2d4b1fce3255` |
| `937438346b5bb039f72c2ec4cc3dfec815fd04f9` | `937438346b5bb039f72c2ec4cc3dfec815fd04f9` |
| `98456602ad60c48a5224c2d50d24f8aa0e042aac` | `b0131215a659f5d4abc0f54cb75b540fabe0c620` |
| `9903a637e01d84cb49cc16212d8c1e43b333c951` | `9903a637e01d84cb49cc16212d8c1e43b333c951` |
| `9a6b76cb3419c3c658abcca1e8d63ba9af113562` | `9a6b76cb3419c3c658abcca1e8d63ba9af113562` |
| `9a875e6f62d24e2d8f84e3000a996818cb1cb539` | `9a875e6f62d24e2d8f84e3000a996818cb1cb539` |
| `9af6d8e5244469fe9c01b5611ccaa8530b58c6d3` | `4845bf8a32affa805bb32d3341c25a239b16747f` |
| `a13b28be2152c1545019bbd07a7471e26e2b30d0` | `a13b28be2152c1545019bbd07a7471e26e2b30d0` |
| `a224f5a082eaa091e26ffb89f0a20a6ab6400763` | `a224f5a082eaa091e26ffb89f0a20a6ab6400763` |
| `a274d4c1680794af0204906e8edcf3291ec48a4b` | `a274d4c1680794af0204906e8edcf3291ec48a4b` |
| `a2ca5fccfc3b9cd53be2098fd6a7f0da84873ca9` | `4eb2429042d6f47fb30fb3e3fccdcc0195290da6` |
| `a35a1e48a4e4b9247afce188a26c67bbf62e4df9` | `a35a1e48a4e4b9247afce188a26c67bbf62e4df9` |
| `a4410efbcc7b3d8ecb99a104c6c8c288817688e7` | `2f5a6e24774ab0a900e820fb63a3d8877bbea679` |
| `a801f60cbd748a2fcd388dcb5b020df99f0cbc2a` | `a801f60cbd748a2fcd388dcb5b020df99f0cbc2a` |
| `a8fecf73f7ba614dd43b1ad0e0dc42d7a85dfc64` | `e5cf897b2892a9e23b8efe422ef34c0e9c214041` |
| `ac97df6c219496e7abafd563cf4c3b24d8134162` | `ac97df6c219496e7abafd563cf4c3b24d8134162` |
| `b0df20d8cf15a86adc17444357287ccb5bb2d39c` | `c686108591437927ca22869d9c0fd58b0d4dc406` |
| `b19db2b7f1033729f75e3fc7e10f9708e2e0204a` | `b19db2b7f1033729f75e3fc7e10f9708e2e0204a` |
| `b396a9bf582c1e5f28c66ae0705c127f26d61c21` | `b396a9bf582c1e5f28c66ae0705c127f26d61c21` |
| `b4803bf168296549cad37e749e4a03bd85ca625c` | `519ef48b4f2260be827165ecc8aa2ab07d83e41d` |
| `b7e03cac6b8933830a7cca4e0f78107b47b44ab6` | `b7e03cac6b8933830a7cca4e0f78107b47b44ab6` |
| `b7e3e85f2ab5da35177631911250ed343cda1b2b` | `4dc45de2241660b3233898086a5c1e4dd17f7ee8` |
| `bbe3dbecd3b7a000c375fec5bb93a0eb442b842b` | `bbe3dbecd3b7a000c375fec5bb93a0eb442b842b` |
| `bbef7171ca93986ddb002e27b1cc0da942d82f5a` | `b78fc56f3adee52a1436b3557fec1b3d44c14f85` |
| `bc38c7a5f4f0119e16d6cffa51865cf6287db9d0` | `3ef87e2301b0ed2204301842545e8b91ce204a3f` |
| `c18ba94ed98c389ac4eff07d7e95acd387eb1f2f` | `c18ba94ed98c389ac4eff07d7e95acd387eb1f2f` |
| `c38478edf295565ae83b88aa5badd2f45ca62783` | `c38478edf295565ae83b88aa5badd2f45ca62783` |
| `c45cb3fd14f670d69779976f5828de72bac99c3d` | `c45cb3fd14f670d69779976f5828de72bac99c3d` |
| `c99044d4fca02dbf7b23f401aba0ee0ce5d90ae5` | `c99044d4fca02dbf7b23f401aba0ee0ce5d90ae5` |
| `cc46a05dd705ea70a1e88d24c2b73cd2b8922b33` | `cc46a05dd705ea70a1e88d24c2b73cd2b8922b33` |
| `ce5d56f9c147c92afa4c292d65d2c2aa23e3796e` | `ce5d56f9c147c92afa4c292d65d2c2aa23e3796e` |
| `ce869ad8b04e5464570da5bac4cc863abbe22911` | `ce869ad8b04e5464570da5bac4cc863abbe22911` |
| `cf0c73654bc4c27e391824930869a12500dd86fe` | `da7b59e509d35a48cd85fae72c70ef88f61fbfb9` |
| `d303080b33e7f90a8eda651d4353494c1af12c32` | `d303080b33e7f90a8eda651d4353494c1af12c32` |
| `d46ffe0c8c875b5e2e8755ec281e31d1b45509fe` | `d46ffe0c8c875b5e2e8755ec281e31d1b45509fe` |
| `d719dd973f2c753feed967004bbbe6243243d05e` | `d719dd973f2c753feed967004bbbe6243243d05e` |
| `d7c9a2100155b99905141361fe6a82d8d2c15078` | `d7c9a2100155b99905141361fe6a82d8d2c15078` |
| `d82476ca32e49d4c191f969d1856eefc1fa6cff6` | `d82476ca32e49d4c191f969d1856eefc1fa6cff6` |
| `d84b20cd8e30820d49ccb522a556b0ea06e2d896` | `d84b20cd8e30820d49ccb522a556b0ea06e2d896` |
| `d9fb04e01185064845774860cb7f099fb2ad9ab9` | `d9fb04e01185064845774860cb7f099fb2ad9ab9` |
| `db3cb115405b4b289f9081eb9eb88cb2611782da` | `db3cb115405b4b289f9081eb9eb88cb2611782da` |
| `e29ce4f4b104cf6360406d502121f392620e1415` | `e29ce4f4b104cf6360406d502121f392620e1415` |
| `e5d6bde651266a625c4f550b9347ec877258a350` | `d52a05d2c585cdbd87f515173a29809f10851e9c` |
| `e67efa20cabeedb1379412d92518203dacad9d1c` | `fb90cefddffffd60bb04abf7e0fe46e942c12147` |
| `ea95e0ca73eea9402cd4f48e884ab573f8012d4b` | `ec40680b30fbfc72d1cc6267bf8bf09e31ef7e2d` |
| `eaf4898fc3bf76bd9b9be27e6f0d7ed421d4fef7` | `eaf4898fc3bf76bd9b9be27e6f0d7ed421d4fef7` |
| `ebd08ad536e2355efb76cd6431839b42b640f5ca` | `3e08595e00aa90c29f24d0fb3df67f869803d891` |
| `ebd65b5baeccda25f1438dcbec8100af74f65d64` | `ebd65b5baeccda25f1438dcbec8100af74f65d64` |
| `ed889ab649720230e48f18ff50eb969f70493ca5` | `ed889ab649720230e48f18ff50eb969f70493ca5` |
| `edd1d20d42a2555bfbb2e71c83c16f2aca316953` | `edd1d20d42a2555bfbb2e71c83c16f2aca316953` |
| `ee5997f5f489e721276c4a1e979fd17f83ba1f38` | `ee5997f5f489e721276c4a1e979fd17f83ba1f38` |
| `f20da1e37df978fb96776c12e4b08efc5c62917a` | `f20da1e37df978fb96776c12e4b08efc5c62917a` |
| `f2963cc55858d246457bfaefe7009804bb45b7a9` | `f2963cc55858d246457bfaefe7009804bb45b7a9` |
| `f3c76270667fc0680b6936cbf5d98515b538362d` | `f3c76270667fc0680b6936cbf5d98515b538362d` |
| `fae5e023d279946dbfac04475d995f47b95014d1` | `4fdbcfceacb8ba69ad423137935f7c2b7f06b1bf` |
| `fba6db650a8f3a266dbae9f58a7dfd14a4479619` | `fba6db650a8f3a266dbae9f58a7dfd14a4479619` |
| `fc80d15dd251623368334466f0d47014c71406e7` | `679f763ca95849063fd3b3fbcddb0630e7e18bac` |
| `fcb976f3bed21efdb3808084290a35ebe3daba4d` | `fcb976f3bed21efdb3808084290a35ebe3daba4d` |
| `ff2577054f0c97118a7753be0fe06866c8ba7d4f` | `ec4b8c771ba6ddcdb1df09b67082e39972ade593` |
