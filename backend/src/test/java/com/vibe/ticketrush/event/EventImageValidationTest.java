package com.vibe.ticketrush.event;

import com.vibe.ticketrush.event.dto.EventDtos.WriteEvent;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class EventImageValidationTest {
    @Test void acceptsOptionalCloudinaryImagesAndRejectsOtherUrls() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            Instant now = Instant.now();
            for (String url : Arrays.asList(null, "", "https://res.cloudinary.com/demo/image/upload/v1/events/banner.jpg",
                    "https://res.cloudinary.com/my-cloud/image/upload/c_fill,w_800/banner.jpg?x=1")) {
                assertThat(validator.validate(new WriteEvent("Event", null, null, null, url,
                        now, now, now, now))).as("URL: %s", url).isEmpty();
            }
            for (String url : List.of("javascript:alert(1)", "http://res.cloudinary.com/demo/image/upload/a.jpg",
                    "https://res.cloudinary.com.evil.test/demo/image/upload/a.jpg",
                    "https://res.cloudinary.com@evil.test/demo/image/upload/a.jpg",
                    "https://res.cloudinary.com/demo/video/upload/a.mp4",
                    "https://res.cloudinary.com/demo/image/upload/", " ",
                    "https://res.cloudinary.com/demo/image/upload/a b.jpg",
                    "https://res.cloudinary.com/demo/image/upload/" + "a".repeat(2048))) {
                assertThat(validator.validate(new WriteEvent("Event", null, null, null, url,
                        now, now, now, now))).as("URL: %s", url).isNotEmpty();
            }
        }
    }
}
