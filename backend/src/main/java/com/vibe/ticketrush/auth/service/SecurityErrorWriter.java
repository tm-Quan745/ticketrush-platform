package com.vibe.ticketrush.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.common.dto.ApiError;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import java.io.IOException;

@Component
public class SecurityErrorWriter {
    private final ObjectMapper mapper;
    public SecurityErrorWriter(ObjectMapper mapper) { this.mapper = mapper; }
    public void write(HttpServletRequest request, HttpServletResponse response, int status,
                      String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), ApiError.of(status, code, message, request.getRequestURI()));
    }
}
