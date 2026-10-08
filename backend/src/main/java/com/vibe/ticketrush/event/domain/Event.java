package com.vibe.ticketrush.event.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "events")
public class Event {
    @Id
    private UUID id;
    private String title;
    private String description;
    private String venueName;
    private String venueAddress;
    private String imageUrl;
    private Instant startTime;
    private Instant endTime;
    private Instant saleStartTime;
    private Instant saleEndTime;
    @Enumerated(EnumType.STRING)
    private EventStatus status;
    private UUID createdBy;
    private Instant createdAt;
    private Instant updatedAt;
    public UUID getId() { return id; }
    public void setId(UUID value) { this.id = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { this.title = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
    public String getVenueName() { return venueName; }
    public void setVenueName(String value) { this.venueName = value; }
    public String getVenueAddress() { return venueAddress; }
    public void setVenueAddress(String value) { this.venueAddress = value; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String value) { this.imageUrl = value; }
    public Instant getStartTime() { return startTime; }
    public void setStartTime(Instant value) { this.startTime = value; }
    public Instant getEndTime() { return endTime; }
    public void setEndTime(Instant value) { this.endTime = value; }
    public Instant getSaleStartTime() { return saleStartTime; }
    public void setSaleStartTime(Instant value) { this.saleStartTime = value; }
    public Instant getSaleEndTime() { return saleEndTime; }
    public void setSaleEndTime(Instant value) { this.saleEndTime = value; }
    public EventStatus getStatus() { return status; }
    public void setStatus(EventStatus value) { this.status = value; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID value) { this.createdBy = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { this.createdAt = value; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant value) { this.updatedAt = value; }
}
