package com.vibe.ticketrush.common.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;
import java.util.*;

@Component
public class ClientAddress {
    private final List<IpAddressMatcher> proxies;
    public ClientAddress(RateLimitProperties properties) { proxies=properties.trustedProxies().stream().filter(s -> !s.isBlank()).map(IpAddressMatcher::new).toList(); }
    private boolean trusted(String ip) { return proxies.stream().anyMatch(p -> p.matches(ip)); }
    public String resolve(HttpServletRequest request) {
        String remote=request.getRemoteAddr();
        String header=request.getHeader("X-Forwarded-For");
        if (!trusted(remote) || header==null || header.length()>2048) return remote;
        String[] chain=header.split(",");
        for (int i=chain.length-1;i>=0;i--) {
            String ip=chain[i].trim();
            // Numeric literals only: never resolve a hostname provided by a client.
            if (!ip.matches("[0-9a-fA-F:.]+")) return remote;
            if (!ip.contains(":")) {
                if (!ip.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return remote;
                for (String octet:ip.split("\\.")) if (Integer.parseInt(octet)>255) return remote;
            }
            try { ip=java.net.InetAddress.getByName(ip).getHostAddress(); }
            catch (java.net.UnknownHostException e) { return remote; }
            if (!trusted(ip)) return ip;
        }
        return remote;
    }
}
