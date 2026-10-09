package com.vibe.ticketrush.reservation.service;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
@Configuration
@EnableScheduling
@EnableConfigurationProperties(ReservationProperties.class)
public class ReservationConfig {}
