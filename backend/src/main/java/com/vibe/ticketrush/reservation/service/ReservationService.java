package com.vibe.ticketrush.reservation.service;
import com.vibe.ticketrush.reservation.dto.ReservationDtos.*;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.dao.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.LongAdder;
@Service
public class ReservationService {
    private final ReservationTransactions transactions;
    private final ReservationProperties properties;
    private final LongAdder retries=new LongAdder();
    public ReservationService(ReservationTransactions transactions, ReservationProperties properties) {
        this.transactions=transactions; this.properties=properties;
    }
    public long retryCount() { return retries.sum(); }
    public View create(UUID user, UUID tier, int quantity) {
        for (int attempt=1; ; attempt++) {
            try { return transactions.create(user,tier,quantity); }
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
