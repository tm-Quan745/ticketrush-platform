package com.vibe.ticketrush.notification.service;
public class RetryableNotificationException extends RuntimeException { public RetryableNotificationException(String message,Throwable cause) { super(message,cause); } }
