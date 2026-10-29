package com.vibe.ticketrush.event.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.*;
import java.net.URI;
import java.util.*;

@Service
public class CloudinaryImageService {
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    private final String config;
    private final RestClient client;

    @Autowired
    public CloudinaryImageService(@Value("${app.cloudinary.url:}") String config) {
        this(config, client());
    }

    CloudinaryImageService(String config, RestClient client) {
        this.config = config;
        this.client = client;
    }

    private static RestClient client() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(10000);
        return RestClient.builder().requestFactory(factory).build();
    }

    public String upload(MultipartFile file) {
        if (file.isEmpty()) throw invalid("Choose a JPEG, PNG or GIF image");
        if (file.getSize() > MAX_BYTES)
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "IMAGE_TOO_LARGE", "Image must be at most 5 MiB");
        byte[] bytes;
        String format;
        try {
            bytes = file.getBytes();
            try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw invalid("Choose a valid JPEG, PNG or GIF image");
                var reader = readers.next();
                try {
                    reader.setInput(input);
                    format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if (!Set.of("jpeg", "png", "gif").contains(format)) throw invalid("Unsupported image format");
                    long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                    if (pixels < 1 || pixels > 20_000_000) throw invalid("Image must contain at most 20 million pixels");
                    reader.read(0);
                } finally { reader.dispose(); }
            }
        } catch (IOException ex) { throw invalid("Image could not be read"); }

        URI settings;
        String[] credentials;
        try {
            settings = URI.create(config);
            credentials = settings.getUserInfo().split(":", 2);
            if (!"cloudinary".equals(settings.getScheme()) || settings.getHost() == null
                    || !settings.getHost().matches("[A-Za-z0-9_-]+") || credentials.length != 2
                    || credentials[0].isBlank() || credentials[1].isBlank()) throw new IllegalArgumentException();
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "IMAGE_UPLOAD_NOT_CONFIGURED", "Image upload is not configured");
        }
        var body = new LinkedMultiValueMap<String, String>();
        body.add("file", "data:image/" + format + ";base64," + Base64.getEncoder().encodeToString(bytes));
        try {
            JsonNode response = client.post()
                    .uri("https://api.cloudinary.com/v1_1/" + settings.getHost() + "/image/upload")
                    .headers(headers -> headers.setBasicAuth(credentials[0], credentials[1]))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(body)
                    .retrieve().body(JsonNode.class);
            String url = response == null ? "" : response.path("secure_url").asText("");
            String prefix = "https://res.cloudinary.com/" + settings.getHost() + "/image/upload/";
            if (!url.startsWith(prefix) || url.length() > 2048 || url.length() == prefix.length()) throw uploadFailed();
            return url;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 401 || ex.getStatusCode().value() == 403)
                throw new ApiException(HttpStatus.BAD_GATEWAY, "IMAGE_UPLOAD_CREDENTIALS_REJECTED",
                        "Cloudinary rejected the credentials. Check CLOUDINARY_URL and restart the backend");
            throw uploadFailed();
        } catch (ResourceAccessException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "IMAGE_UPLOAD_CONNECTION_FAILED",
                    "Could not connect to Cloudinary or the request timed out");
        } catch (RestClientException ex) {
            // Do not propagate upstream bodies or credentials to logs and API clients.
            throw uploadFailed();
        }
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", message);
    }
    private static ApiException uploadFailed() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "IMAGE_UPLOAD_FAILED", "Image upload failed; please try again");
    }
}
