package com.vibe.ticketrush.auth.service;

import com.vibe.ticketrush.auth.repository.UserRepository;
import com.vibe.ticketrush.common.service.ApiException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class UserDirectoryService implements UserDirectory {
    private final UserRepository users;
    public UserDirectoryService(UserRepository users) { this.users=users; }
    public String emailOf(UUID userId) { return users.findById(userId).map(u -> u.getEmail()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"USER_NOT_FOUND","Unknown notification recipient")); }
}
