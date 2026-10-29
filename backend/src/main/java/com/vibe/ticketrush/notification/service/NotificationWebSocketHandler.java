package com.vibe.ticketrush.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.common.events.EventPayloads;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.*;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/** Best-effort invalidations; the authenticated REST snapshot remains authoritative. */
@Component
public class NotificationWebSocketHandler extends TextWebSocketHandler {
    private static final TextMessage READY = new TextMessage("{\"type\":\"ready\"}");
    private static final TextMessage CHANGED = new TextMessage("{\"type\":\"orders.changed\"}");
    private static final TextMessage RESERVATIONS_CHANGED = new TextMessage("{\"type\":\"reservations.changed\"}");
    private static final TextMessage HEARTBEAT = new TextMessage("{\"type\":\"heartbeat\"}");
    private final ConcurrentHashMap<String, Client> clients = new ConcurrentHashMap<>();
    private final JwtDecoder decoder;
    private final ObjectMapper json;

    private static final class Client {
        final WebSocketSession session;
        final Instant connected = Instant.now();
        final AtomicBoolean dirty = new AtomicBoolean();
        final AtomicBoolean reservationsDirty = new AtomicBoolean();
        volatile UUID user;
        volatile Instant expires;
        Instant lastHeartbeat = Instant.now();
        Client(WebSocketSession session) {
            this.session = new ConcurrentWebSocketSessionDecorator(session, 1000, 4096);
        }
    }

    public NotificationWebSocketHandler(JwtDecoder decoder, ObjectMapper json) {
        this.decoder = decoder;
        this.json = json;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) throws IOException {
        if (clients.size() >= 1000) {
            session.close(CloseStatus.SERVICE_OVERLOAD);
            return;
        }
        session.setTextMessageSizeLimit(4096);
        clients.put(session.getId(), new Client(session));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Client client = clients.get(session.getId());
        if (client == null) return;
        try {
            if (client.user != null || Instant.now().isAfter(client.connected.plusSeconds(5)))
                throw new IllegalArgumentException("Unexpected frame");
            var frame = json.readTree(message.getPayload());
            if (!"authenticate".equals(frame.path("type").asText()))
                throw new IllegalArgumentException("Authentication required");
            var jwt = decoder.decode(frame.path("token").asText());
            if (jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now())
                    || jwt.getClaimAsStringList("roles") == null || !jwt.getClaimAsStringList("roles").contains("USER"))
                throw new IllegalArgumentException("User access required");
            client.expires = jwt.getExpiresAt();
            client.user = UUID.fromString(jwt.getSubject());
            send(client, READY);
        } catch (Exception error) {
            close(client, CloseStatus.POLICY_VIOLATION);
        }
    }

    @TransactionalEventListener
    public void orderChanged(EventPayloads.Order event) {
        // Never perform network I/O on the committing business thread.
        clients.values().forEach(client -> {
            if (event.userId().equals(client.user)) client.dirty.set(true);
        });
    }

    @TransactionalEventListener
    public void reservationExpired(EventPayloads.Reservation event) {
        clients.values().forEach(client -> {
            if (event.userId().equals(client.user)) client.reservationsDirty.set(true);
        });
    }

    @Scheduled(fixedDelay = 1000)
    public void flush() {
        Instant now = Instant.now();
        clients.values().forEach(client -> {
            if (client.user == null) {
                if (!now.isBefore(client.connected.plusSeconds(5))) close(client, CloseStatus.POLICY_VIOLATION);
            } else if (!now.isBefore(client.expires)) {
                close(client, CloseStatus.POLICY_VIOLATION);
            } else {
                if (client.dirty.getAndSet(false)) send(client, CHANGED);
                if (client.reservationsDirty.getAndSet(false)) send(client, RESERVATIONS_CHANGED);
                if (!now.isBefore(client.lastHeartbeat.plusSeconds(20))) {
                    send(client, HEARTBEAT);
                    client.lastHeartbeat = now;
                }
            }
        });
    }

    private void send(Client client, TextMessage message) {
        try { client.session.sendMessage(message); }
        catch (Exception error) { close(client, CloseStatus.SERVER_ERROR); }
    }

    private void close(Client client, CloseStatus status) {
        clients.remove(client.session.getId(), client);
        try { client.session.close(status); } catch (IOException ignored) { /* Already disconnected. */ }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        clients.remove(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        Client client = clients.get(session.getId());
        if (client != null) close(client, CloseStatus.SERVER_ERROR);
    }
}
