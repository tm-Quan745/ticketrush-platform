package com.vibe.ticketrush.inventory.dto;
import java.util.UUID;
public record InventoryViolation(UUID tierId, long available, long held, long confirmed, long total) {}
