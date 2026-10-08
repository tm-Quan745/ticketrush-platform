package com.vibe.ticketrush.inventory.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ticket_tiers")
public class TicketTier {
    @Id
    private UUID id;
    private UUID eventId;
    private String name;
    private String description;
    private long price;
    private String currency;
    private int totalQuantity;
    private int availableQuantity;
    private int maxPerOrder;
    @Version
    private long version;
    private Instant createdAt;
    private Instant updatedAt;
    public UUID getId() { return id; }
    public void setId(UUID value) { this.id = value; }
    public UUID getEventId() { return eventId; }
    public void setEventId(UUID value) { this.eventId = value; }
    public String getName() { return name; }
    public void setName(String value) { this.name = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
    public long getPrice() { return price; }
    public void setPrice(long value) { this.price = value; }
    public String getCurrency() { return currency; }
    public void setCurrency(String value) { this.currency = value; }
    public int getTotalQuantity() { return totalQuantity; }
    public void setTotalQuantity(int value) { this.totalQuantity = value; }
    public int getAvailableQuantity() { return availableQuantity; }
    public void setAvailableQuantity(int value) { this.availableQuantity = value; }
    public int getMaxPerOrder() { return maxPerOrder; }
    public void setMaxPerOrder(int value) { this.maxPerOrder = value; }
    public long getVersion() { return version; }
    public void setVersion(long value) { this.version = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { this.createdAt = value; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant value) { this.updatedAt = value; }
}
