package com.vibe.ticketrush.payment.controller;

import com.vibe.ticketrush.payment.service.*;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.common.service.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Validator;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/v1/payments")
public class WebhookController {
    private final WebhookSignature signature;
    private final WebhookService service;
    private final ObjectMapper json;
    private final Validator validator;
    public WebhookController(WebhookSignature signature,WebhookService service,ObjectMapper json,Validator validator) {
        this.signature=signature; this.service=service; this.json=json; this.validator=validator;
    }
    @PostMapping("/webhook")
    @Operation(summary="Process a signed provider event after commit",security={},responses={
        @ApiResponse(responseCode="200",description="Committed or duplicate event"),
        @ApiResponse(responseCode="400",description="Malformed or unsupported event"),
        @ApiResponse(responseCode="401",description="Invalid signature or timestamp"),
        @ApiResponse(responseCode="404",description="Unknown payment reference"),
        @ApiResponse(responseCode="422",description="Unexpected refund event"),
        @ApiResponse(responseCode="500",description="Transient processing failure; retry the same event ID")})
    public void webhook(@RequestHeader(value="X-Payment-Timestamp",defaultValue="") String timestamp,
            @RequestHeader(value="X-Payment-Signature",defaultValue="") String supplied,@RequestBody byte[] body) {
        signature.verify(timestamp,supplied,body);
        if (body.length>65536) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_EVENT","Event too large");
        PaymentEvent event;
        try { event=json.readValue(body,PaymentEvent.class); }
        catch (java.io.IOException e) { throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_EVENT","Malformed or unsupported event"); }
        if (event==null || !validator.validate(event).isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_EVENT","Invalid event fields");
        try { service.process(event,new String(body,StandardCharsets.UTF_8)); }
        catch (ApiException e) { throw e; }
        catch (RuntimeException e) {
            // Provider retries must not mistake an internal integrity/commit failure for bad input.
            throw new IllegalStateException("Webhook transaction failed; retry the same event",e);
        }
    }
}
