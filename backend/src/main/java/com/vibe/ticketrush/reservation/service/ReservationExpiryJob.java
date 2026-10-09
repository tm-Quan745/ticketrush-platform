package com.vibe.ticketrush.reservation.service;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@Component
@ConditionalOnProperty(name="ticketrush.reservation.expiry-enabled",havingValue="true",matchIfMissing=true)
public class ReservationExpiryJob {
    private final ReservationTransactions transactions;
    public ReservationExpiryJob(ReservationTransactions transactions) { this.transactions=transactions; }
    @Scheduled(fixedDelayString="${ticketrush.reservation.job-interval:30s}")
    public void run() { transactions.expireBatch(); }
}
