package com.vibe.ticketrush.common.service;

import java.util.UUID;

/** Request scoped correlation id, also usable from scheduled jobs. */
public final class CorrelationId {
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();
    private CorrelationId() {}
    public static String current() { return CURRENT.get() == null ? UUID.randomUUID().toString() : CURRENT.get(); }
    public static void set(String value) { CURRENT.set(value); }
    public static void clear() { CURRENT.remove(); }
}
