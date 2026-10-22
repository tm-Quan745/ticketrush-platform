package com.vibe.ticketrush.inventory.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.auth.service.TokenService;
import com.vibe.ticketrush.inventory.service.SeatReadService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/events/{id}")
public class SeatReadController {
    private final SeatReadService service;
    private final ObjectMapper json;
    public SeatReadController(SeatReadService service,ObjectMapper json){this.service=service;this.json=json;}
    @GetMapping("/seatmap")
    public Map<String,Object> map(@PathVariable UUID id){return service.seatmap(id);}
    @GetMapping("/sections/{sectionId}/seats")
    public ResponseEntity<SeatReadService.SectionSeats> seats(@PathVariable UUID id,@PathVariable UUID sectionId,
            @AuthenticationPrincipal Jwt caller,@RequestHeader(name="If-None-Match",required=false) String condition) throws com.fasterxml.jackson.core.JsonProcessingException {
        var body=service.seats(id,sectionId,UUID.fromString(caller.getSubject()));
        String etag='"'+TokenService.hash(json.writeValueAsString(body))+'"';
        boolean unchanged=condition!=null && Arrays.stream(condition.split(",")).map(String::trim)
            .anyMatch(value->value.equals("*")||value.equals(etag)||value.equals("W/"+etag));
        return ResponseEntity.status(unchanged?304:200).eTag(etag).header(HttpHeaders.CACHE_CONTROL,"private, no-cache")
            .header(HttpHeaders.VARY,"Authorization").body(unchanged?null:body);
    }
    @PostMapping("/seats/suggest")
    public SeatReadService.Suggestion suggest(@PathVariable UUID id,@AuthenticationPrincipal Jwt caller,
            @Valid @RequestBody SeatReadService.SuggestRequest request,
            @RequestHeader(name="X-Admission-Token",required=false) String token){
        return service.suggest(id,UUID.fromString(caller.getSubject()),request,token);
    }
}
