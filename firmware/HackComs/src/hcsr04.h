
#ifndef HCSR04_H
#define HCSR04_H

#include <stdint.h>
#include "driver/gpio.h"
#include "driver/rmt_rx.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_err.h"

typedef struct {
    gpio_num_t trigger_pin;
    gpio_num_t echo_pin;
    uint32_t timeout_us;

    rmt_channel_handle_t rx_channel;
    QueueHandle_t rx_queue;
    rmt_symbol_word_t rx_symbols[64];
} hcsr04_t;

esp_err_t hcsr04_init(hcsr04_t *sensor);

esp_err_t hcsr04_read(
    hcsr04_t *sensor,
    float *distance_cm
);

esp_err_t hcsr04_read_filtered(
    hcsr04_t *sensor,
    float *distance_cm
);

#endif
