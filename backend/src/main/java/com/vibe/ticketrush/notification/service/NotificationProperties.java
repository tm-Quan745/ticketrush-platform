package com.vibe.ticketrush.notification.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
@ConfigurationProperties("ticketrush.notification")
public record NotificationProperties(int maxRetries,int concurrency,int prefetch) {}
