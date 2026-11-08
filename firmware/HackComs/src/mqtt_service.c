
#include "mqtt_service.h"
#include "buzzer.h"
#include "esp_log.h"
#include "esp_event.h"
#include "mqtt_client.h"

static const char *TAG = "MQTT_SERVICE";

static esp_mqtt_client_handle_t client = NULL;
static bool mqtt_connected = false;

static void mqtt_event_handler(
    void *handler_args,
    esp_event_base_t base,
    int32_t event_id,
    void *event_data
) {
    esp_mqtt_event_handle_t event =
        (esp_mqtt_event_handle_t)event_data;

    switch ((esp_mqtt_event_id_t)event_id) {

        case MQTT_EVENT_CONNECTED:
            mqtt_connected = true;
            buzzer_long();
            ESP_LOGI(TAG, "Connected to RabbitMQ");
            break;

        case MQTT_EVENT_DISCONNECTED:
            mqtt_connected = false;
            ESP_LOGW(TAG, "MQTT disconnected");
            break;

        case MQTT_EVENT_PUBLISHED:
            ESP_LOGI(TAG,
                "Published message ID: %d",
                event->msg_id
            );
            break;

        case MQTT_EVENT_ERROR:
            ESP_LOGE(TAG, "MQTT error");
            break;

        default:
            break;
    }
}

void mqtt_service_init(
    const char *broker_uri,
    const char *username,
    const char *password
) {
    esp_mqtt_client_config_t config = {
        .broker.address.uri = broker_uri,
        .credentials.username = username,
        .credentials.authentication.password = password,
        .network.reconnect_timeout_ms = 5000,
        .network.disable_auto_reconnect = false
    };

    client = esp_mqtt_client_init(&config);

    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to initialize MQTT");
        return;
    }

    ESP_ERROR_CHECK(esp_mqtt_client_register_event(
        client,
        ESP_EVENT_ANY_ID,
        mqtt_event_handler,
        NULL
    ));

    ESP_ERROR_CHECK(esp_mqtt_client_start(client));

    ESP_LOGI(TAG, "MQTT client started");
}

bool mqtt_service_is_connected(void) {
    return mqtt_connected;
}

esp_err_t mqtt_service_publish(
    const char *topic,
    const char *json
) {
    if (client == NULL || !mqtt_connected) {
        ESP_LOGW(TAG, "MQTT not connected");
        return ESP_ERR_INVALID_STATE;
    }

    int msg_id = esp_mqtt_client_publish(
        client,
        topic,
        json,
        0,     // Calculate payload length
        1,     // QoS 1
        0      // Retain = false
    );

    if (msg_id < 0) {
        ESP_LOGE(TAG, "Publish failed");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Queued MQTT message: %d", msg_id);

    return ESP_OK;
}
