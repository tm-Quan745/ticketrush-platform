package com.vibe.ticketrush.inventory.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class SeatingVerifier {
    private final NamedParameterJdbcTemplate jdbc;
    private final String query;
    public SeatingVerifier(JdbcTemplate jdbc) throws java.io.IOException {
        this.jdbc=new NamedParameterJdbcTemplate(jdbc);
        this.query=new ClassPathResource("sql/verify-seating.sql").getContentAsString(StandardCharsets.UTF_8);
    }
    public record Violation(String code,UUID entityId) {}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<Violation> verify(UUID event) {
        return jdbc.query(query,Map.of("event",event),(rs,n)->new Violation(rs.getString(1),rs.getObject(2,UUID.class)));
    }
}
