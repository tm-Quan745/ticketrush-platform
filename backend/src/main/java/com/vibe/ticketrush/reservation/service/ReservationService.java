package com.vibe.ticketrush.reservation.service;
import com.vibe.ticketrush.reservation.dto.ReservationDtos.*;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.dao.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.LongAdder;
@Service
public class ReservationService {
    private final ReservationTransactions transactions;
    private final ReservationProperties properties;
    private final LongAdder retries=new LongAdder();
    private final com.vibe.ticketrush.inventory.service.InventoryAdmission gate;
    private final LongAdder databaseAttempts=new LongAdder();
    private final com.vibe.ticketrush.queue.service.ReservationAdmission queue;
    // Pessimistic PostgreSQL locking remains the cross-instance correctness
    // mechanism.  These local stripes keep same-tier waiters from occupying
    // every JDBC connection before one transaction can make progress.
    private final ReentrantLock[] pessimisticStripes=java.util.stream.IntStream.range(0,256)
            .mapToObj(ignored -> new ReentrantLock()).toArray(ReentrantLock[]::new);
    public ReservationService(ReservationTransactions transactions, ReservationProperties properties,
            com.vibe.ticketrush.inventory.service.InventoryAdmission gate, com.vibe.ticketrush.queue.service.ReservationAdmission queue) {
        this.transactions=transactions; this.properties=properties; this.gate=gate; this.queue=queue;
    }
    public long databaseAttempts() { return databaseAttempts.sum(); }
    public long retryCount() { return retries.sum(); }
    public View create(UUID user, UUID tier, int quantity) {
        return create(user,tier,quantity,null);
    }
    public View create(UUID user, UUID tier, int quantity,String token) {
        var admission="redis-gate".equals(properties.strategy()) ? gate.begin(tier,quantity) : null;
        boolean committed=false;
        try {
            queue.requireAdmission(tier,user,token);
            View result=createSerializedIfPessimistic(user,tier,quantity);
            committed=true;
            if (admission==null) gate.afterCommit(tier,-quantity);
            return result;
        } finally { gate.complete(admission,committed); }
    }
    private View createSerializedIfPessimistic(UUID user,UUID tier,int quantity) {
        if (!"pessimistic".equals(properties.strategy())) return createInDatabase(user,tier,quantity);
        ReentrantLock lock=pessimisticStripes[Math.floorMod(tier.hashCode(),pessimisticStripes.length)];
        lock.lock();
        try { return createInDatabase(user,tier,quantity); }
        finally { lock.unlock(); }
    }
    private View createInDatabase(UUID user, UUID tier, int quantity) {
        for (int attempt=1; ; attempt++) {
            try { databaseAttempts.increment(); return transactions.create(user,tier,quantity); }
            catch (DataIntegrityViolationException e) {
                if (hasConstraint(e,"uq_reservations_active")) throw ReservationTransactions.duplicate();
                throw e;
            }
            catch (OptimisticLockingFailureException e) {
                if (attempt>=properties.optimisticAttempts()) throw busy();
                retries.increment();
                try { Thread.sleep(ThreadLocalRandom.current().nextLong(2,Math.min(100,2L+attempt*5))); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw busy(); }
            }
            catch (PessimisticLockingFailureException e) { throw busy(); }
        }
    }
    private boolean hasConstraint(Throwable error, String name) {
        for (Throwable t=error;t!=null;t=t.getCause())
            if (t instanceof org.hibernate.exception.ConstraintViolationException c && name.equals(c.getConstraintName())) return true;
        return false;
    }
    private ApiException busy() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"INVENTORY_BUSY","Inventory contention; retry later"); }
}
