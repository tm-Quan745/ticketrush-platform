package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.inventory.dto.TierDtos.PublicTier;
import java.util.*;
public interface InventoryRead {
    List<PublicTier> publicTiers(UUID eventId);
}
