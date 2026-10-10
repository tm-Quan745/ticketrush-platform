package com.vibe.ticketrush.auth.service;

import java.util.UUID;

/** Module interface; notification never accesses auth repositories directly. */
public interface UserDirectory { String emailOf(UUID userId); }
