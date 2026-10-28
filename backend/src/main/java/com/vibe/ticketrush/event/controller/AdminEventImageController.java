package com.vibe.ticketrush.event.controller;

import com.vibe.ticketrush.event.service.CloudinaryImageService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/admin/events/images")
public class AdminEventImageController {
    private final CloudinaryImageService images;
    public AdminEventImageController(CloudinaryImageService images) { this.images = images; }
    public record UploadedImage(String imageUrl) {}

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadedImage upload(@RequestParam("file") MultipartFile file) {
        return new UploadedImage(images.upload(file));
    }
}
