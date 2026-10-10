package com.vibe.ticketrush.notification.controller;

import com.vibe.ticketrush.notification.domain.EmailStatus;
import com.vibe.ticketrush.notification.repository.NotificationRepository;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/admin/notifications")
public class NotificationAdminController {
    private final NotificationRepository notifications;
    public NotificationAdminController(NotificationRepository notifications) { this.notifications=notifications; }
    @GetMapping public List<NotificationRepository.Row> list(@RequestParam(defaultValue="FAILED") EmailStatus status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { if(page<0||size<1||size>100) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST); return notifications.list(status,page,size); }
    @PostMapping("/{id}/resend") public ResponseEntity<Void> resend(@PathVariable UUID id) { return notifications.retry(id)?ResponseEntity.noContent().build():ResponseEntity.notFound().build(); }
}
