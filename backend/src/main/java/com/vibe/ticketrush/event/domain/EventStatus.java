package com.vibe.ticketrush.event.domain;
public enum EventStatus {
    DRAFT, PUBLISHED, CANCELLED, ENDED;
    public boolean canTransitionTo(EventStatus next) {
        return (this == DRAFT && next == PUBLISHED)
                || (this == PUBLISHED && (next == CANCELLED || next == ENDED));
    }
}
