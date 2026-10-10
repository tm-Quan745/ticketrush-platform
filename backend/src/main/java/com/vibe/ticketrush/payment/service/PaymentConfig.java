package com.vibe.ticketrush.payment.service;

import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@Configuration
@EnableConfigurationProperties(PaymentProperties.class)
public class PaymentConfig {}
