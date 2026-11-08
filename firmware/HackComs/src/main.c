#include <stdio.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_err.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "buzzer.h"
#include "wifi_manager.h"
#include "mqtt_service.h"
#include "hcsr04.h"
#include "secrets.h"

#define DETECTION_THRESHOLD_CM 40.0f

static const char *TAG = "HYDRANTWATCH";

static hcsr04_t side_sensor = {
    .trigger_pin = GPIO_NUM_18,
    .echo_pin = GPIO_NUM_19,
    .timeout_us = 30000
};

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();

    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {

        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
       
    }

    ESP_ERROR_CHECK(ret);

buzzer_init();  // IMPORTANT

ESP_ERROR_CHECK(hcsr04_init(&side_sensor));

    ESP_LOGI(TAG,
        "Mock location: %.6f, %.6f",
        MOCK_LATITUDE,
        MOCK_LONGITUDE
    );

    wifi_manager_init(WIFI_SSID, WIFI_PASSWORD);

    while (!wifi_manager_is_connected()) {
        ESP_LOGI(TAG, "Waiting for Wi-Fi...");
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    mqtt_service_init(
        MQTT_URI,
        MQTT_USERNAME,
        MQTT_PASSWORD
    );

    uint32_t sequence = 0;
    char json[256];

    while (1) {

        if (wifi_manager_is_connected() &&
            mqtt_service_is_connected()) {

            float side_distance_cm;
            float snow_distance_cm = 40.0f; // Mock reading

            esp_err_t sensor_result =
                hcsr04_read_filtered(
                    &side_sensor,
                    &side_distance_cm
                );

            if (sensor_result == ESP_OK) {

                if (side_distance_cm < DETECTION_THRESHOLD_CM) {
        ESP_LOGW(TAG, "OBSTRUCTION DETECTED");
        buzzer_detected();
    }

                snprintf(
                    json,
                    sizeof(json),
                    "{"
                        "\"deviceId\":\"%s\","
                        "\"hydrantId\":\"%s\","
                        "\"sequence\":%lu,"
                        "\"sideDistanceCm\":%.2f,"
                        "\"snowDistanceCm\":%.2f"
                    "}",
                    DEVICE_ID,
                    HYDRANT_ID,
                    (unsigned long)sequence,
                    side_distance_cm,
                    snow_distance_cm
                );

                esp_err_t publish_result =
                    mqtt_service_publish(
                        MQTT_TOPIC,
                        json
                    );

                if (publish_result == ESP_OK) {
                    ESP_LOGI(TAG, "Published: %s", json);
                    sequence++;
                }

            } else {
                ESP_LOGW(TAG,
                    "Sensor failed: %s",
                    esp_err_to_name(sensor_result)
                );
            }
        }

        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}