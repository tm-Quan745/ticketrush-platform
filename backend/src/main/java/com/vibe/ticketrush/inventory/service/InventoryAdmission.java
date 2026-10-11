package com.vibe.ticketrush.inventory.service;

import java.util.*;

/** Module boundary for admission and administrative reconciliation. */
public interface InventoryAdmission {
    record Attempt(UUID tier,UUID id,String result) {}
    record Drift(UUID tierId,Long observed,long expected,String result) {}
    Attempt begin(UUID tier,int quantity);
    void complete(Attempt attempt,boolean committed);
    void afterCommit(UUID tier,int delta);
    List<Drift> reconcile(UUID event);
}
