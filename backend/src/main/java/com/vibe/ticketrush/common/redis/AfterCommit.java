package com.vibe.ticketrush.common.redis;

import org.springframework.transaction.support.*;

public final class AfterCommit {
    private AfterCommit() {}
    public static void run(Runnable action) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            action.run(); return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { action.run(); }
        });
    }
}
