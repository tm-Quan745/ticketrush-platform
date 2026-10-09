package com.vibe.ticketrush.reservation.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity
@Table(name = "reservations")
public class Reservation {
    @Id
    private UUID id;
    private UUID userId;
    private UUID tierId;
    private int quantity;
    @Enumerated(EnumType.STRING)
    private ReservationStatus status;
    private Instant expiresAt;
    private Instant createdAt;
    private Instant updatedAt;
    @Version
    private long version;
    public UUID getId() { return id; }
    public void setId(UUID value) { this.id = value; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID value) { this.userId = value; }
    public UUID getTierId() { return tierId; }
    public void setTierId(UUID value) { this.tierId = value; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int value) { this.quantity = value; }
    public ReservationStatus getStatus() { return status; }
    public void setStatus(ReservationStatus value) { this.status = value; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant value) { this.expiresAt = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { this.createdAt = value; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant value) { this.updatedAt = value; }
    public long getVersion() { return version; }
    public void setVersion(long value) { this.version = value; }
}
