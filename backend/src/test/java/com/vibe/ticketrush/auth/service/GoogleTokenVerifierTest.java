package com.vibe.ticketrush.auth.service;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.vibe.ticketrush.common.service.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import java.time.Instant;
import java.util.Date;
import java.util.function.Consumer;
import static org.assertj.core.api.Assertions.*;

class GoogleTokenVerifierTest {
    static RSAKey key;
    GoogleTokenVerifier verifier;
    @BeforeAll static void keys() throws Exception { key = new RSAKeyGenerator(2048).generate(); }
    @BeforeEach void setup() throws Exception {
        verifier = new GoogleTokenVerifier("web-client", NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build());
    }
    String token(Consumer<JWTClaimsSet.Builder> change, RSAKey signingKey) throws Exception {
        var claims = new JWTClaimsSet.Builder().issuer("https://accounts.google.com").audience("web-client")
                .subject("google-subject").claim("email", "person@gmail.com").claim("email_verified", true)
                .issueTime(new Date()).expirationTime(Date.from(Instant.now().plusSeconds(300)));
        change.accept(claims);
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims.build());
        jwt.sign(new RSASSASigner(signingKey)); return jwt.serialize();
    }
    @Test void acceptsBothGoogleIssuers() throws Exception {
        assertThat(verifier.verify(token(c -> {}, key)).subject()).isEqualTo("google-subject");
        assertThat(verifier.verify(token(c -> c.issuer("accounts.google.com"), key)).email()).isEqualTo("person@gmail.com");
    }
    @Test void rejectsUntrustedClaims() throws Exception {
        var changes = java.util.List.<Consumer<JWTClaimsSet.Builder>>of(
                c -> c.issuer("https://attacker.invalid"), c -> c.issuer(null),
                c -> c.audience("another-client"), c -> c.claim("aud", null), c -> c.claim("azp", "another-client"),
                c -> c.issueTime(null), c -> c.issueTime(Date.from(Instant.now().plusSeconds(120))),
                c -> c.expirationTime(Date.from(Instant.now().minusSeconds(120))), c -> c.expirationTime(null),
                c -> c.subject(""), c -> c.subject(null), c -> c.claim("email_verified", false),
                c -> c.claim("email_verified", null), c -> c.claim("email", "invalid"));
        for (var change : changes) {
            String token = token(change, key);
            assertThatThrownBy(() -> verifier.verify(token)).isInstanceOf(ApiException.class)
                    .extracting(e -> ((ApiException)e).getCode()).isEqualTo("INVALID_GOOGLE_TOKEN");
        }
    }
    @Test void rejectsForgedAndMalformedTokens() throws Exception {
        String forged = token(c -> {}, new RSAKeyGenerator(2048).generate());
        assertThatThrownBy(() -> verifier.verify(forged)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> verifier.verify("invalid")).isInstanceOf(ApiException.class);
    }
    @Test void disabledWithoutConfiguration() throws Exception {
        var disabled = new GoogleTokenVerifier("", NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build());
        assertThatThrownBy(() -> disabled.verify("anything")).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException)e).getCode()).isEqualTo("GOOGLE_LOGIN_DISABLED");
    }
}
