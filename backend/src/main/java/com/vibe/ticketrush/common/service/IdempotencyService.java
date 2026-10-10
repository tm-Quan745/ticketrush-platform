package com.vibe.ticketrush.common.service;

import com.vibe.ticketrush.common.repository.IdempotencyRepository;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Clock;
import java.util.*;
import java.util.function.Supplier;

/** Claims commit independently; business writes and completion share one transaction. */
@Service
public class IdempotencyService {
    private final IdempotencyRepository keys;
    private final TransactionTemplate tx;
    private final Clock clock;
    public IdempotencyService(IdempotencyRepository keys,PlatformTransactionManager manager,Clock clock) {
        this.keys=keys; this.clock=clock; this.tx=new TransactionTemplate(manager);
        tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.setTimeout(30);
    }
    public record StoredResponse(int status,String body,boolean replayed) {}
    public StoredResponse execute(UUID user,String endpoint,UUID key,String canonicalRequest,Supplier<StoredResponse> action) {
        String hash=hash(canonicalRequest);
        UUID claim=UUID.randomUUID();
        var prior=tx.execute(s -> {
            if (keys.insert(claim,user,endpoint,key,hash,clock.instant())) return null;
            var entry=keys.find(user,endpoint,key);
            if (!entry.hash().equals(hash)) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"IDEMPOTENCY_PAYLOAD_MISMATCH","Key was used with another payload");
            keys.recover(entry.id(),clock.instant());
            if (keys.insert(claim,user,endpoint,key,hash,clock.instant())) return null;
            if (entry.status().equals("COMPLETED")) return new StoredResponse(entry.responseStatus(),entry.body(),true);
            throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_BUSY","Request in progress; retry shortly");
        });
        if (prior!=null) return prior;
        try {
            return tx.execute(s -> {
                keys.lock(claim);
                var response=action.get();
                keys.complete(claim,response.status(),response.body());
                return response;
            });
        } catch (RuntimeException failure) {
            tx.executeWithoutResult(s -> keys.abandon(claim));
            throw failure;
        }
    }
    @Scheduled(fixedDelayString="${ticketrush.payment.key-cleanup-interval:1h}")
    public void cleanup() { tx.executeWithoutResult(s -> keys.cleanup(clock.instant())); }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
