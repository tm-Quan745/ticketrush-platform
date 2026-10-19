package com.vibe.ticketrush.common.service;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.UUID;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component @Order(-110)
public class CorrelationIdFilter implements Filter {
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest http = (HttpServletRequest) request;
        String id = http.getHeader("X-Correlation-Id");
        CorrelationId.set(id == null || !id.matches("[A-Za-z0-9_-]{1,64}") ? UUID.randomUUID().toString() : id);
        try { ((HttpServletResponse) response).setHeader("X-Correlation-Id", CorrelationId.current()); chain.doFilter(request,response); }
        finally { CorrelationId.clear(); }
    }
}
