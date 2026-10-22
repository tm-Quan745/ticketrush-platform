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
    public ResponseEntity<String> seats(@PathVariable UUID id,@PathVariable UUID sectionId,
            @RequestHeader(name="If-None-Match",required=false) String condition) {
        return response(service.seats(id,sectionId,null),condition,"private, no-cache");
    }
    @GetMapping("/sections/{sectionId}/geometry/{version}")
    public ResponseEntity<String> geometry(@PathVariable UUID id,@PathVariable UUID sectionId,@PathVariable String version,
            @RequestHeader(name="If-None-Match",required=false) String condition) {
        if(!version.matches("[a-f0-9]{64}"))throw new com.vibe.ticketrush.common.service.ApiException(HttpStatus.NOT_FOUND,"GEOMETRY_NOT_FOUND","Unknown geometry version");
        return response(service.geometry(id,sectionId,version),condition,"public, max-age=31536000, immutable");
    }
    private ResponseEntity<String> response(SeatReadService.Wire data,String condition,String policy) {
        boolean unchanged=condition!=null && Arrays.stream(condition.split(",")).map(String::trim)
            .anyMatch(value->value.equals("*")||value.equals(data.etag())||value.equals("W/"+data.etag()));
        return ResponseEntity.status(unchanged?304:200).eTag(data.etag()).contentType(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.CACHE_CONTROL,policy).body(unchanged?null:data.body());
    }
    @PostMapping("/seats/suggest")
    public SeatReadService.Suggestion suggest(@PathVariable UUID id,@AuthenticationPrincipal Jwt caller,
            @Valid @RequestBody SeatReadService.SuggestRequest request,
            @RequestHeader(name="X-Admission-Token",required=false) String token){
        return service.suggest(id,UUID.fromString(caller.getSubject()),request,token);
    }
}
