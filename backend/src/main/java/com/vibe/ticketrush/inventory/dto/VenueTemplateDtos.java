package com.vibe.ticketrush.inventory.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public final class VenueTemplateDtos {
    private VenueTemplateDtos() {}
    public record CreateVenue(
        @NotBlank @Size(max=100) @Pattern(regexp="[a-z0-9][a-z0-9-]*") String templateKey,
        @NotBlank @Size(max=200) String name,
        @Min(200) @Max(2000) int width, @Min(200) @Max(2000) int height,
        @NotEmpty @Size(max=20) List<@NotNull @Valid SectionInput> sections,
        @Valid StageInput stage) {}
    public record StageInput(
        @Min(0) @Max(2000) int x, @Min(0) @Max(2000) int y,
        @Min(20) @Max(2000) int width, @Min(20) @Max(2000) int height) {}
    public record SectionInput(
        @NotBlank @Size(max=40) @Pattern(regexp="[A-Z0-9_]+") String code,
        @NotBlank @Size(max=200) String name,
        @NotNull @Pattern(regexp="GA|SEATED") String type,
        @NotNull @Pattern(regexp="#[0-9a-fA-F]{6}") String color,
        @Min(0) @Max(2000) int x, @Min(0) @Max(2000) int y,
        @Min(20) @Max(2000) int width, @Min(20) @Max(2000) int height,
        @Min(0) @Max(100) int rows, @Min(0) @Max(100) int columns,
        @Min(1) @Max(100) int aisleEvery) {}
}
