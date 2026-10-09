package com.vibe.ticketrush.common.service;
import java.time.Clock;
import org.springframework.context.annotation.*;
@Configuration
public class ClockConfig {
    @Bean public Clock clock() { return Clock.systemUTC(); }
}
