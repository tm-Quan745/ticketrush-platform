package com.vibe.ticketrush.notification.service;
public class NonRetryableNotificationException extends RuntimeException { public NonRetryableNotificationException(String message,Throwable cause) { super(message,cause); } public NonRetryableNotificationException(String message) { super(message); } }
