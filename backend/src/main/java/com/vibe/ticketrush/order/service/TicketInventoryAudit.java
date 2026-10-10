package com.vibe.ticketrush.order.service;

import java.util.*;
public interface TicketInventoryAudit { Map<UUID,Long> validTickets(UUID eventId); }
