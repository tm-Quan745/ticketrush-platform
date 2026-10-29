package com.vibe.ticketrush.event.service;

import com.vibe.ticketrush.common.service.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class CloudinaryImageServiceTest {
    private static final String CONFIG = "cloudinary://test-key:test-secret@test-cloud";
    private static final String ENDPOINT = "https://api.cloudinary.com/v1_1/test-cloud/image/upload";
    private MockMultipartFile image() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", output);
        return new MockMultipartFile("file", "photo.png", "image/png", output.toByteArray());
    }

    @Test void uploadsBytesWithServerCredentialsAndReturnsSecureUrl() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        String url = "https://res.cloudinary.com/test-cloud/image/upload/v1/photo.png";
        server.expect(requestTo(ENDPOINT)).andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Basic dGVzdC1rZXk6dGVzdC1zZWNyZXQ="))
                .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("file=data%3Aimage%2Fpng%3Bbase64%2C")))
                .andRespond(withSuccess("{\"secure_url\":\"" + url + "\"}", MediaType.APPLICATION_JSON));
        assertThat(new CloudinaryImageService(CONFIG, builder.build()).upload(image())).isEqualTo(url);
        server.verify();
    }

    @Test void rejectsInvalidFilesWithoutCallingProvider() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new CloudinaryImageService(CONFIG, builder.build());
        for (byte[] bytes : new byte[][] {new byte[0], "<svg/>".getBytes(), new byte[CloudinaryImageService.MAX_BYTES + 1]}) {
            assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "fake.png", "image/png", bytes)))
                    .isInstanceOf(ApiException.class);
        }
        server.verify();
    }

    @Test void configurationAndUpstreamErrorsDoNotExposeSecrets() throws Exception {
        var file = image();
        assertThatThrownBy(() -> new CloudinaryImageService("", RestClient.create()).upload(file))
                .isInstanceOf(ApiException.class).hasMessage("Image upload is not configured");
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ENDPOINT)).andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("test-secret"));
        assertThatThrownBy(() -> new CloudinaryImageService(CONFIG, builder.build()).upload(file))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.getCode()).isEqualTo("IMAGE_UPLOAD_CREDENTIALS_REJECTED");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
                    assertThat(ex.getMessage()).contains("CLOUDINARY_URL").doesNotContain("test-secret");
                });
        server.verify();
    }

    @Test void connectionFailureHasDistinctSafeError() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ENDPOINT)).andRespond(withException(new java.net.SocketTimeoutException("test-secret")));
        var service = new CloudinaryImageService(CONFIG, builder.build());
        var file = image();
        assertThatThrownBy(() -> service.upload(file)).isInstanceOfSatisfying(ApiException.class, ex -> {
            assertThat(ex.getCode()).isEqualTo("IMAGE_UPLOAD_CONNECTION_FAILED");
            assertThat(ex.getMessage()).doesNotContain("test-secret");
        });
        server.verify();
    }
    @Test void rejectsUnexpectedProviderUrl() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ENDPOINT)).andRespond(withSuccess("{\"secure_url\":\"https://evil.test/a.png\"}", MediaType.APPLICATION_JSON));
        var service = new CloudinaryImageService(CONFIG, builder.build());
        var file = image();
        assertThatThrownBy(() -> service.upload(file)).isInstanceOf(ApiException.class);
        server.verify();
    }
}
