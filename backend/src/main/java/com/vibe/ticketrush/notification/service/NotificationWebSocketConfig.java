package com.vibe.ticketrush.notification.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class NotificationWebSocketConfig implements WebSocketConfigurer {
    private final NotificationWebSocketHandler handler;
    private final String[] origins;

    public NotificationWebSocketConfig(NotificationWebSocketHandler handler,
            @Value("${NOTIFICATION_WS_ORIGINS:http://localhost:3000,http://127.0.0.1:3000}") String[] origins) {
        this.handler = handler;
        this.origins = origins;
        for (String origin : origins) {
            var uri = java.net.URI.create(origin);
            if (origin.contains("*") || uri.getHost() == null
                    || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())))
                throw new IllegalArgumentException("Explicit HTTP(S) WebSocket origins required");
        }
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/v1/notifications/ws").setAllowedOrigins(origins);
    }
}
