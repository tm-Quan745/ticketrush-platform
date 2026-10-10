package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.HexFormat;

@Component
public class WebhookSignature {
    private final PaymentProperties properties;
    private final Clock clock;
    public WebhookSignature(PaymentProperties properties,Clock clock) { this.properties=properties; this.clock=clock; }
    public String sign(String timestamp,byte[] body) {
        if (properties.webhookSecret().length()<32) throw new IllegalStateException("PAYMENT_WEBHOOK_SECRET must contain at least 32 characters");
        try {
            Mac mac=Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.webhookSecret().getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            mac.update((timestamp+".").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(body));
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    public void verify(String timestamp,String signature,byte[] body) {
        try {
            Instant sent=Instant.ofEpochSecond(Long.parseLong(timestamp));
            if (Duration.between(sent,clock.instant()).abs().compareTo(properties.timestampTolerance())>0) throw invalid();
            byte[] supplied=HexFormat.of().parseHex(signature);
            byte[] expected=HexFormat.of().parseHex(sign(timestamp,body));
            if (!MessageDigest.isEqual(expected,supplied)) throw invalid();
        } catch (IllegalArgumentException | DateTimeException e) { throw invalid(); }
    }
    private static ApiException invalid() { return new ApiException(HttpStatus.UNAUTHORIZED,"INVALID_WEBHOOK_SIGNATURE","Invalid signature or timestamp"); }
}
