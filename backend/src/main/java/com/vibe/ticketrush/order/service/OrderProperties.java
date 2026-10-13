package com.vibe.ticketrush.order.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.order")
public record OrderProperties(@DefaultValue("true") boolean joinedStatusRead) { }
