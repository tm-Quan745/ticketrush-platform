package com.vibe.ticketrush.common.ratelimit;

import com.vibe.ticketrush.auth.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.time.Duration;
import java.util.Locale;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

public class RateLimitFilter extends OncePerRequestFilter {
    private final RedisRateLimiter limiter;
    private final RateLimitProperties properties;
    private final ClientAddress addresses;
    private final AuthProperties auth;
    private final SecurityErrorWriter errors;
    private final ObjectMapper json;
    public RateLimitFilter(RedisRateLimiter limiter,RateLimitProperties properties,ClientAddress addresses,
            AuthProperties auth,SecurityErrorWriter errors,ObjectMapper json) {
        this.limiter=limiter; this.properties=properties; this.addresses=addresses; this.auth=auth; this.errors=errors; this.json=json;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !properties.enabled() || request.getRequestURI().equals("/api/v1/payments/webhook");
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String path=request.getRequestURI(),method=request.getMethod(),ip="ip:"+addresses.resolve(request);
        var authentication=SecurityContextHolder.getContext().getAuthentication();
        String user=authentication!=null && authentication.getPrincipal() instanceof Jwt jwt ? "user:"+jwt.getSubject():null;
        if (method.equals("POST") && path.equals("/api/v1/auth/login")) {
            if (!allow("login-ip",ip,auth.loginLimit(),auth.loginWindow(),Math.min(3,auth.loginLimit()),request,response)) return;
            byte[] body=request.getInputStream().readNBytes(16385);
            if (body.length>16384) { errors.write(request,response,413,"REQUEST_TOO_LARGE","Request body too large"); return; }
            String username="invalid";
            try { username=json.readTree(body).path("email").asText("invalid").trim().toLowerCase(Locale.ROOT); }
            catch (IOException | NullPointerException ignored) { /* MVC reports invalid JSON after IP limiting. */ }
            if (!allow("login-username","username:"+username,auth.loginLimit(),auth.loginWindow(),Math.min(3,auth.loginLimit()),request,response)) return;
            request=new BodyRequest(request,body);
        } else if (method.equals("POST") && (path.equals("/api/v1/auth/register") || path.equals("/api/v1/auth/refresh"))) {
            String policy=path.endsWith("register") ? "register":"refresh";
            if (!allow(policy,ip,30,Duration.ofMinutes(1),15,request,response)) return;
        } else if (user!=null && method.equals("POST") && (path.equals("/api/v1/reservations") || path.equals("/api/v1/orders"))) {
            if (!allow(path.endsWith("orders") ? "orders":"reservations",user,60,Duration.ofMinutes(1),20,request,response)) return;
        } else if (user!=null && path.matches("/api/v1/events/[^/]+/waiting-room/(join|status)")) {
            boolean status=path.endsWith("status");
            if (!allow(status ? "queue-status":"queue-join",user,status ? 120:20,Duration.ofMinutes(1),status ? 30:10,request,response)) return;
        } else if (path.matches("/api/v1/events/[^/]+/(seatmap|sections/[^/]+/(seats|geometry/[^/]+)|seats/suggest)")) {
            if (!allow("seat-read-ip",ip,30000,Duration.ofMinutes(1),300,request,response)) return;
            if (user!=null && !allow("seat-read-user",user,120,Duration.ofMinutes(1),10,request,response)) return;
        } else if (method.equals("GET") && path.matches("/api/v1/events(/[^/]+)?")) {
            if (!allow("public",ip,300,Duration.ofMinutes(1),100,request,response)) return;
        }
        chain.doFilter(request,response);
    }
    private boolean allow(String policy,String identity,int capacity,Duration period,int local,HttpServletRequest request,HttpServletResponse response) throws IOException {
        var decision=limiter.check(policy,identity,properties.policy(policy,capacity,period,local));
        response.setHeader("X-RateLimit-Limit",Integer.toString(decision.limit()));
        response.setHeader("X-RateLimit-Remaining",Long.toString(decision.remaining()));
        response.setHeader("X-RateLimit-Reset",Long.toString(decision.resetEpochSeconds()));
        if (decision.allowed()) return true;
        response.setHeader("Retry-After",Long.toString(Math.max(1,decision.retrySeconds())));
        errors.write(request,response,429,"RATE_LIMITED","Too many requests"); return false;
    }
    private static final class BodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        BodyRequest(HttpServletRequest request,byte[] body) { super(request); this.body=body; }
        @Override public ServletInputStream getInputStream() {
            var input=new ByteArrayInputStream(body);
            return new ServletInputStream() {
                public int read() { return input.read(); }
                public boolean isFinished() { return input.available()==0; }
                public boolean isReady() { return true; }
                public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Synchronous request body"); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),java.nio.charset.StandardCharsets.UTF_8)); }
    }
}
