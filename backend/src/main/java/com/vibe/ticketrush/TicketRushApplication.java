package com.vibe.ticketrush;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class TicketRushApplication {
    public static void main(String[] args) {
        SpringApplication.run(TicketRushApplication.class, args);
    }
}
