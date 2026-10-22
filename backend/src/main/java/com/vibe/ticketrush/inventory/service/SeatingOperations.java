package com.vibe.ticketrush.inventory.service;

import java.time.Instant;
import java.util.*;

/** Inventory module boundary used by reservation and payment orchestration. */
public interface SeatingOperations {
    boolean isSeated(UUID tier);
    UUID tierFor(List<UUID> ids);
    void tryUserTierLock(UUID user,UUID tier);
    void hold(UUID reservation,UUID tier,List<UUID> ids,Instant expiresAt);
    void release(UUID reservation,boolean refund);
    void sellHeld(UUID reservation,int quantity);
    boolean reacquire(UUID reservation,UUID tier,int quantity);
    List<SeatedInventory.Assignment> assignments(UUID reservation);
    List<SeatedInventory.TicketSeat> ticketSeats(UUID reservation);
}
