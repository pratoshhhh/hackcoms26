
#include "hcsr04.h"

#include <string.h>
#include "esp_check.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "driver/rmt_rx.h"
#include "freertos/task.h"

static const char *TAG = "HCSR04";

static bool on_rx_done(
    rmt_channel_handle_t channel,
    const rmt_rx_done_event_data_t *event,
    void *user_data
) {
    QueueHandle_t queue = (QueueHandle_t)user_data;
    BaseType_t wake = pdFALSE;

    xQueueSendFromISR(queue, event, &wake);

    return wake == pdTRUE;
}

esp_err_t hcsr04_init(hcsr04_t *sensor)
{
    if (!sensor ||
        sensor->trigger_pin == sensor->echo_pin ||
        sensor->timeout_us == 0 ||
        sensor->timeout_us > 30000) {
        return ESP_ERR_INVALID_ARG;
    }

    // Configure TRIG output
    gpio_config_t trigger_config = {
        .pin_bit_mask = 1ULL << sensor->trigger_pin,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };

    ESP_RETURN_ON_ERROR(
        gpio_config(&trigger_config),
        TAG, "TRIG configuration failed"
    );

    ESP_ERROR_CHECK(
        gpio_set_level(sensor->trigger_pin, 0)
    );

    // Configure ECHO with RMT receiver
    rmt_rx_channel_config_t rx_config = {
        .gpio_num = sensor->echo_pin,
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 1000000,
        .mem_block_symbols = 64
    };

    ESP_RETURN_ON_ERROR(
        rmt_new_rx_channel(
            &rx_config,
            &sensor->rx_channel
        ),
        TAG, "RMT initialization failed"
    );

    sensor->rx_queue = xQueueCreate(
        1,
        sizeof(rmt_rx_done_event_data_t)
    );

    if (!sensor->rx_queue) {
        rmt_del_channel(sensor->rx_channel);
        sensor->rx_channel = NULL;
        return ESP_ERR_NO_MEM;
    }

    rmt_rx_event_callbacks_t callbacks = {
        .on_recv_done = on_rx_done
    };

    esp_err_t err = rmt_rx_register_event_callbacks(
        sensor->rx_channel,
        &callbacks,
        sensor->rx_queue
    );

    if (err != ESP_OK) {
        vQueueDelete(sensor->rx_queue);
        rmt_del_channel(sensor->rx_channel);
        sensor->rx_queue = NULL;
        sensor->rx_channel = NULL;
        return err;
    }

    ESP_LOGI(TAG, "RMT sensor initialized");

    return ESP_OK;
}

esp_err_t hcsr04_read(
    hcsr04_t *sensor,
    float *distance_cm
) {
    if (!sensor || !distance_cm ||
        !sensor->rx_channel || !sensor->rx_queue) {
        return ESP_ERR_INVALID_ARG;
    }

    *distance_cm = 0.0f;

    if (gpio_get_level(sensor->echo_pin)) {
        ESP_LOGW(TAG, "ECHO is HIGH before trigger");
        return ESP_ERR_INVALID_STATE;
    }

    xQueueReset(sensor->rx_queue);

    esp_err_t err = rmt_enable(sensor->rx_channel);
    if (err != ESP_OK) return err;

    rmt_receive_config_t receive_config = {
    .signal_range_min_ns = 1000,
    .signal_range_max_ns = 30000000
};

    // Arm receiver before sending trigger
    err = rmt_receive(
        sensor->rx_channel,
        sensor->rx_symbols,
        sizeof(sensor->rx_symbols),
        &receive_config
    );

    if (err != ESP_OK) {
        rmt_disable(sensor->rx_channel);
        return err;
    }

    // Generate HC-SR04 trigger
    esp_rom_delay_us(2);
    gpio_set_level(sensor->trigger_pin, 1);
    esp_rom_delay_us(10);
    gpio_set_level(sensor->trigger_pin, 0);

    rmt_rx_done_event_data_t rx_data;

    // Wait for RMT to finish capturing ECHO
    BaseType_t received = xQueueReceive(
        sensor->rx_queue,
        &rx_data,
        pdMS_TO_TICKS(50)
    );

    if (received != pdTRUE) {
        rmt_disable(sensor->rx_channel);
        ESP_LOGW(TAG, "No complete echo captured");
        return ESP_ERR_TIMEOUT;
    }

    ESP_LOGI(TAG,
    "RMT captured %u symbols",
    (unsigned)rx_data.num_symbols
);

for (size_t i = 0;
     i < rx_data.num_symbols && i < 8;
     i++) {

    rmt_symbol_word_t s =
        rx_data.received_symbols[i];

    ESP_LOGI(TAG,
        "Symbol %u: level0=%u duration0=%u "
        "level1=%u duration1=%u",
        (unsigned)i,
        (unsigned)s.level0,
        (unsigned)s.duration0,
        (unsigned)s.level1,
        (unsigned)s.duration1
    );
}
    uint32_t pulse_us = 0;

    // Find a valid HIGH pulse
    for (size_t i = 0; i < rx_data.num_symbols; i++) {
        rmt_symbol_word_t symbol =
            rx_data.received_symbols[i];

        if (symbol.level0 == 1 &&
            symbol.duration0 >= 100 &&
            symbol.duration0 <= 24000) {
            pulse_us = symbol.duration0;
            break;
        }

        if (symbol.level1 == 1 &&
            symbol.duration1 >= 100 &&
            symbol.duration1 <= 24000) {
            pulse_us = symbol.duration1;
            break;
        }
    }

    rmt_disable(sensor->rx_channel);

    if (pulse_us == 0) {
        ESP_LOGW(TAG, "No valid HIGH pulse");
        return ESP_ERR_NOT_FOUND;
    }

    *distance_cm = pulse_us * 0.0343f / 2.0f;

    if (*distance_cm < 2.0f ||
        *distance_cm > 400.0f) {
        return ESP_ERR_INVALID_RESPONSE;
    }

    return ESP_OK;
}

esp_err_t hcsr04_read_filtered(
    hcsr04_t *sensor,
    float *distance_cm
) {
    if (!sensor || !distance_cm) {
        return ESP_ERR_INVALID_ARG;
    }

    float values[5];
    int valid = 0;

    for (int i = 0; i < 5; i++) {
        float reading;

        if (hcsr04_read(sensor, &reading) == ESP_OK) {
            values[valid++] = reading;
        }

        vTaskDelay(pdMS_TO_TICKS(70));
    }

    if (valid < 3) {
        ESP_LOGW(TAG, "Only %d/5 valid readings", valid);
        return ESP_ERR_TIMEOUT;
    }

    // Sort valid readings
    for (int i = 0; i < valid - 1; i++) {
        for (int j = i + 1; j < valid; j++) {
            if (values[j] < values[i]) {
                float temp = values[i];
                values[i] = values[j];
                values[j] = temp;
            }
        }
    }

    *distance_cm = values[valid / 2];

    return ESP_OK;
}
