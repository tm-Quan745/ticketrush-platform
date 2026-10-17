package com.vibe.ticketrush.common.controller;

import com.vibe.ticketrush.common.dto.ApiError;
import com.vibe.ticketrush.common.service.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import java.time.Instant;
import java.sql.SQLTransientConnectionException;
import java.util.TreeMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final Pattern UUID_PATH_SEGMENT = Pattern.compile("/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)");
    private final MeterRegistry metrics;

    public GlobalExceptionHandler(MeterRegistry metrics) {
        this.metrics = metrics;
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> api(ApiException ex, HttpServletRequest request) {
        request.setAttribute("metric.error", ex.getCode());
        apiException(ex.getCode(), ex.getStatus().value(), request.getRequestURI());
        ResponseEntity.BodyBuilder response=ResponseEntity.status(ex.getStatus());
        if ("WAITING_ROOM_UNAVAILABLE".equals(ex.getCode()) || "WAITING_ROOM_NOT_READY".equals(ex.getCode())) {
            response.header(HttpHeaders.RETRY_AFTER, Integer.toString(1 + ThreadLocalRandom.current().nextInt(2)));
        }
        return response.body(ApiError.of(ex.getStatus().value(),
                ex.getCode(), ex.getMessage(), request.getRequestURI()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> conflict(HttpServletRequest request) {
        return ResponseEntity.status(409).body(ApiError.of(409, "CONFLICT",
                "The request conflicts with existing data", request.getRequestURI()));
    }

    @ExceptionHandler(CannotGetJdbcConnectionException.class)
    ResponseEntity<ApiError> poolTimeout(CannotGetJdbcConnectionException ex, HttpServletRequest request) {
        return poolUnavailable(ex, request);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var errors = new TreeMap<String, String>();
        ex.getBindingResult().getFieldErrors().forEach(e -> errors.putIfAbsent(e.getField(), e.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ApiError(Instant.now(), 400, "VALIDATION_ERROR",
                "Invalid request", path(request), errors));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return new ResponseEntity<>(ApiError.of(status.value(), "INVALID_REQUEST",
                "Request could not be processed", path(request)), headers, status);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception ex, HttpServletRequest request) {
        if (hikariTimeout(ex)) return poolUnavailable(ex, request);
        LOG.error("Unhandled request failure", ex);
        return ResponseEntity.internalServerError().body(ApiError.of(500, "INTERNAL_ERROR",
                "An unexpected error occurred", request.getRequestURI()));
    }

    private ResponseEntity<ApiError> poolUnavailable(Exception ex, HttpServletRequest request) {
        LOG.warn("database_pool_timeout correlation_id={}", com.vibe.ticketrush.common.service.CorrelationId.current());
        metrics.counter("database_pool_timeout_total").increment();
        apiException("DATABASE_POOL_TIMEOUT", HttpStatus.SERVICE_UNAVAILABLE.value(), request.getRequestURI());
        request.setAttribute("metric.error", "DATABASE_POOL_TIMEOUT");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header(HttpHeaders.RETRY_AFTER, "1")
            .body(ApiError.of(503, "DATABASE_POOL_TIMEOUT", "Database capacity is temporarily full", request.getRequestURI()));
    }

    private boolean hikariTimeout(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof SQLTransientConnectionException && current.getMessage() != null
                    && current.getMessage().contains("HikariPool")) return true;
        }
        return false;
    }

    private void apiException(String code, int status, String requestUri) {
        metrics.counter("api_exceptions_total", "code", code, "status", Integer.toString(status),
                "endpoint", UUID_PATH_SEGMENT.matcher(requestUri).replaceAll("/{id}")).increment();
    }

    private String path(WebRequest request) {
        return ((ServletWebRequest) request).getRequest().getRequestURI();
    }
}
