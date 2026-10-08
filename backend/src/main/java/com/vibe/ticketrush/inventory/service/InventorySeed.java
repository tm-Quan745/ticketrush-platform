package com.vibe.ticketrush.inventory.service;
import java.util.*;
public interface InventorySeed {
    void seedTiers(List<UUID> eventIds, int countPerEvent);
}
