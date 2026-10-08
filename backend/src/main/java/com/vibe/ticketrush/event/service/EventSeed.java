package com.vibe.ticketrush.event.service;
import java.util.*;
public interface EventSeed {
    List<UUID> seedEvents(int count);
}
