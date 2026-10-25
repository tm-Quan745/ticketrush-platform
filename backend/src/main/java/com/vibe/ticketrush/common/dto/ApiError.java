package com.vibe.ticketrush.common.dto;

import java.time.Instant;
import java.util.Map;

public record ApiError(Instant timestamp, int status, String code, String message,
                       String path, Map<String, String> fieldErrors,
                       @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_EMPTY)
                       java.util.List<java.util.UUID> unavailableSeatIds) {
    public ApiError(Instant timestamp,int status,String code,String message,String path,Map<String,String> fields) {
        this(timestamp,status,code,message,path,fields,java.util.List.of());
    }
    public static ApiError of(int status, String code, String message, String path) {
        return new ApiError(Instant.now(), status, code, message, path, Map.of());
    }
}
