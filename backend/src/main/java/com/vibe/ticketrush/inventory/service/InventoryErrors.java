package com.vibe.ticketrush.inventory.service;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
final class InventoryErrors {
    private InventoryErrors() {}
    static ApiException soldOut() { return new ApiException(HttpStatus.CONFLICT,"SOLD_OUT","Insufficient inventory"); }
}
